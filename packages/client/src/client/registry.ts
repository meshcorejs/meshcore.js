import { BRICK, type Brick, type BrickKind, isBrick } from '../bricks/brick.js';
import type { CommandDefinition } from '../commands/command.js';
import { LoadError, type LoadIssue } from '../errors.js';
import type { EventDefinition } from '../events/event-builder.js';
import type { JobDefinition } from '../jobs/job-builder.js';
import type { PermissionDefinition } from '../permissions/permission-builder.js';
import type { RoleDefinition } from '../permissions/role-builder.js';
import type { PluginDefinition } from '../plugins/plugin-builder.js';
import type { Client } from './client.js';

export interface RegisteredBrick {
  readonly kind: BrickKind;
  readonly brick: Brick;
  readonly file: string | undefined;
  readonly plugin: string | undefined;
  unregister(): void;
}

export interface BrickSource {
  brick: unknown;
  file?: string;
  plugin?: string;
}

export class BrickRegistry {
  readonly #client: Client;
  readonly #bricks: RegisteredBrick[] = [];

  /** @param client Owning client */
  constructor(client: Client) {
    this.#client = client;
  }

  registerAll(sources: BrickSource[]): RegisteredBrick[] {
    const issues: LoadIssue[] = [];
    const built: Array<{ brick: Brick; definition: unknown; file: string | undefined; plugin: string | undefined }> =
      [];
    const withFile = (file: string | undefined) => (file === undefined ? {} : { file });
    const prefixed = (issue: LoadIssue, plugin: string | undefined): LoadIssue =>
      plugin ? { ...issue, brick: `${plugin} › ${issue.brick}` } : issue;
    for (const source of sources) {
      if (!isBrick(source.brick)) {
        issues.push(
          prefixed(
            { ...withFile(source.file), brick: 'export default', message: 'is not a meshcore.js builder' },
            source.plugin,
          ),
        );
        continue;
      }
      try {
        built.push({ brick: source.brick, definition: source.brick.build(), file: source.file, plugin: source.plugin });
      } catch (error) {
        if (!(error instanceof LoadError)) throw error;
        issues.push(...error.issues.map((issue) => prefixed({ ...issue, ...withFile(source.file) }, source.plugin)));
      }
    }
    if (issues.length > 0) throw new LoadError(issues);
    return built.map(({ brick, definition, file, plugin }) => this.#add(brick, definition, file, plugin));
  }

  validate(): LoadIssue[] {
    return [
      ...this.#client.permissions.validate(),
      ...this.#client.roles.validate(),
      ...this.#client.commands.validate(),
      ...this.#client.jobs.validate(),
      ...this.#client.plugins.validate(),
    ];
  }

  bricksFrom(file: string): RegisteredBrick[] {
    return this.#bricks.filter((brick) => brick.file === file);
  }

  #add(brick: Brick, definition: unknown, file: string | undefined, plugin: string | undefined): RegisteredBrick {
    const kind = brick[BRICK];
    let remove: () => void;
    switch (kind) {
      case 'permission': {
        const permission = this.#client.permissions.add(definition as PermissionDefinition);
        remove = () => this.#client.permissions.remove(permission);
        break;
      }
      case 'role': {
        const role = this.#client.roles.add(definition as RoleDefinition);
        remove = () => this.#client.roles.remove(role);
        break;
      }
      case 'command': {
        const command = this.#client.commands.add(definition as CommandDefinition);
        remove = () => this.#client.commands.remove(command);
        break;
      }
      case 'job': {
        const job = this.#client.jobs.add(definition as JobDefinition);
        remove = () => this.#client.jobs.remove(job);
        break;
      }
      case 'event': {
        const event = this.#client.events.add(definition as EventDefinition);
        remove = () => this.#client.events.remove(event);
        break;
      }
      case 'plugin': {
        const instance = this.#client.plugins.add(definition as PluginDefinition, brick);
        remove = () => this.#client.plugins.remove(instance);
        break;
      }
    }
    const registered: RegisteredBrick = {
      kind,
      brick,
      file,
      plugin,
      unregister: () => {
        remove();
        const index = this.#bricks.indexOf(registered);
        if (index !== -1) this.#bricks.splice(index, 1);
      },
    };
    this.#bricks.push(registered);
    return registered;
  }
}
