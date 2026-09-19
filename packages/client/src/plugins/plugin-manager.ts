import type { Brick } from '../bricks/brick.js';
import type { Client } from '../client/client.js';
import { Collection } from '../collection.js';
import { ClientStateError, type LoadIssue } from '../errors.js';
import { Plugin } from './plugin.js';
import type { PluginDefinition } from './plugin-builder.js';

export class PluginManager {
  readonly client: Client;
  readonly cache = new Collection<string, Plugin>();
  readonly #all: Plugin[] = [];
  readonly #byBuilder = new Map<Brick, Plugin>();

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
  }

  get size(): number {
    return this.cache.size;
  }

  /** @param name Plugin name */
  get(name: string): Plugin | undefined;
  /** @param builder The registered PluginBuilder */
  get(builder: Brick): Plugin;
  get(key: string | Brick): Plugin | undefined {
    if (typeof key === 'string') return this.cache.get(key.toLowerCase());
    const plugin = this.#byBuilder.get(key);
    if (!plugin) throw new ClientStateError('this PluginBuilder is not registered on the client');
    return plugin;
  }

  /** @internal */
  add(definition: PluginDefinition, builder: Brick): Plugin {
    const plugin = new Plugin(this.client, definition);
    this.#all.push(plugin);
    this.#byBuilder.set(builder, plugin);
    this.#rebuildCache();
    return plugin;
  }

  /** @internal */
  remove(plugin: Plugin): void {
    const index = this.#all.indexOf(plugin);
    if (index === -1) return;
    if (plugin.loaded) plugin._drop();
    this.#all.splice(index, 1);
    for (const [builder, instance] of this.#byBuilder) if (instance === plugin) this.#byBuilder.delete(builder);
    this.#rebuildCache();
  }

  /** @internal */
  validate(): LoadIssue[] {
    const seen = new Set<string>();
    const issues: LoadIssue[] = [];
    for (const plugin of this.#all) {
      if (seen.has(plugin.name)) issues.push({ brick: `plugin "${plugin.name}"`, message: 'duplicate plugin name' });
      seen.add(plugin.name);
    }
    return issues;
  }

  /** @internal */
  async loadPending(): Promise<void> {
    for (const plugin of [...this.#all]) {
      if (plugin.state === 'pending') await plugin.load();
    }
  }

  /** @internal */
  async loadPendingReporting(): Promise<void> {
    for (const plugin of [...this.#all]) {
      if (plugin.state !== 'pending') continue;
      try {
        await plugin.load();
      } catch (error) {
        this.client._reportError(error, { type: 'plugin', name: plugin.name });
      }
    }
  }

  #rebuildCache(): void {
    this.cache.clear();
    for (const plugin of this.#all) if (!this.cache.has(plugin.name)) this.cache.set(plugin.name, plugin);
  }
}
