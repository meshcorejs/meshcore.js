import { type FSWatcher, watch } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRICK, BRICK_FOLDERS, isBrick } from '../bricks/brick.js';
import { LoadError } from '../errors.js';
import type { Client } from './client.js';
import type { BrickSource, RegisteredBrick } from './registry.js';

const EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.mts']);
export const RELOAD_DEBOUNCE_MS = 100;

export interface LoadOptions {
  watch?: boolean;
}

export function isBrickFile(name: string): boolean {
  return (
    EXTENSIONS.has(extname(name)) &&
    !name.startsWith('_') &&
    !name.endsWith('.d.ts') &&
    !/\.(test|spec)\.[mc]?[jt]s$/.test(name)
  );
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('_')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile() && isBrickFile(entry.name)) files.push(path);
  }
  return files;
}

export class BrickLoader {
  readonly #client: Client;
  readonly #root: string;
  readonly #watchers: FSWatcher[] = [];
  readonly #pending = new Map<string, ReturnType<typeof setTimeout>>();
  #version = 0;

  /**
   * @param client Owning client
   * @param directory Folder to scan, or a module path standing for its folder
   */
  constructor(client: Client, directory: string | URL) {
    this.#client = client;
    const path = resolve(directory instanceof URL ? fileURLToPath(directory) : directory);
    this.#root = EXTENSIONS.has(extname(path)) ? dirname(path) : path;
  }

  async load(): Promise<void> {
    const sources: BrickSource[] = [];
    for (const { folder } of BRICK_FOLDERS) {
      for (const path of await listFiles(join(this.#root, folder))) sources.push(await this.#import(path));
    }
    this.#client.registry.registerAll(sources);
  }

  watch(): void {
    for (const { folder } of BRICK_FOLDERS) {
      const directory = join(this.#root, folder);
      try {
        this.#watchers.push(
          watch(directory, { recursive: true }, (_event, filename) => {
            if (filename && isBrickFile(basename(filename.toString()))) {
              this.#scheduleReload(join(directory, filename.toString()));
            }
          }),
        );
      } catch {}
    }
  }

  close(): void {
    for (const watcher of this.#watchers.splice(0)) watcher.close();
    for (const timer of this.#pending.values()) clearTimeout(timer);
    this.#pending.clear();
  }

  async reloadFile(path: string): Promise<void> {
    const file = relative(this.#root, path);
    const previous: RegisteredBrick[] = this.#client.registry.bricksFrom(file);
    const exists = await stat(path).then(
      (info) => info.isFile(),
      () => false,
    );
    if (!exists) {
      for (const brick of previous) brick.unregister();
      this.#client.logger.info(`hot reload: removed ${file}`);
      return;
    }

    let source: BrickSource;
    try {
      source = await this.#import(path, ++this.#version);
    } catch (error) {
      this.#client.logger.error(`hot reload: cannot import ${file}, keeping the previous version`, error);
      return;
    }

    for (const brick of previous) brick.unregister();
    let added: RegisteredBrick[] = [];
    try {
      added = this.#client.registry.registerAll([source]);
      const issues = this.#client.registry.validate();
      if (issues.length > 0) throw new LoadError(issues);
      await this.#client.plugins.loadPending();
      this.#client.logger.info(`hot reload: reloaded ${file}`);
    } catch (error) {
      for (const brick of added) brick.unregister();
      this.#client.registry.registerAll(previous.map((brick) => ({ brick: brick.brick, file })));
      await this.#client.plugins.loadPending().catch(() => undefined);
      this.#client.logger.error(`hot reload: ${file} is invalid, keeping the previous version`, error);
    }
  }

  #scheduleReload(path: string): void {
    const existing = this.#pending.get(path);
    if (existing) clearTimeout(existing);
    this.#pending.set(
      path,
      setTimeout(() => {
        this.#pending.delete(path);
        this.reloadFile(path).catch((error: unknown) =>
          this.#client._reportError(error, { type: 'internal', name: 'hot reload' }),
        );
      }, RELOAD_DEBOUNCE_MS),
    );
  }

  async #import(path: string, version = 0): Promise<BrickSource> {
    const file = relative(this.#root, path);
    const url = pathToFileURL(path).href + (version > 0 ? `?v=${version}` : '');
    const brick = ((await import(url)) as { default?: unknown }).default;
    const folderKind = BRICK_FOLDERS.find(({ folder }) => file.startsWith(`${folder}${sep}`))?.kind;
    if (isBrick(brick) && folderKind && brick[BRICK] !== folderKind) {
      this.#client.logger.warn(`${file}: ${brick[BRICK]} builder found in the ${folderKind}s folder`);
    }
    return { brick, file };
  }
}
