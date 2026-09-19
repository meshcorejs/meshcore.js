import { BRICK, type Brick, isBrick } from '../bricks/brick.js';
import type { Client } from '../client/client.js';
import type { RegisteredBrick } from '../client/registry.js';
import { ClientStateError, LoadError, type LoadIssue } from '../errors.js';
import type { PluginDefinition } from './plugin-builder.js';

export type PluginState = 'pending' | 'loaded' | 'unloaded';

export class Plugin {
  readonly name: string;
  readonly description: string | undefined;
  readonly #client: Client;
  readonly #definition: PluginDefinition;
  #state: PluginState = 'pending';
  #registered: RegisteredBrick[] = [];

  /**
   * @internal
   * @param client Owning client
   * @param definition Built by PluginBuilder
   */
  constructor(client: Client, definition: PluginDefinition) {
    this.#client = client;
    this.#definition = definition;
    this.name = definition.name;
    this.description = definition.description;
  }

  get state(): PluginState {
    return this.#state;
  }

  get loaded(): boolean {
    return this.#state === 'loaded';
  }

  get bricks(): readonly Brick[] {
    return this.#registered.map((registered) => registered.brick);
  }

  async load(): Promise<void> {
    if (this.loaded) throw new ClientStateError(`plugin "${this.name}" is already loaded`);
    this.#registered = await this.#build();
    this.#state = 'loaded';
    this.#client.emit('pluginLoad', this);
  }

  async unload(): Promise<void> {
    if (!this.loaded) throw new ClientStateError(`plugin "${this.name}" is not loaded`);
    this._drop();
    this.#client.emit('pluginUnload', this);
  }

  async reload(): Promise<void> {
    if (!this.loaded) throw new ClientStateError(`plugin "${this.name}" is not loaded`);
    const previous = this.#registered;
    this._drop();
    this.#client.emit('pluginUnload', this);
    try {
      this.#registered = await this.#build();
    } catch (error) {
      this.#registered = this.#client.registry.registerAll(
        previous.map((registered) => ({ brick: registered.brick, plugin: this.name })),
      );
      this.#state = 'loaded';
      this.#client.emit('pluginLoad', this);
      throw error;
    }
    this.#state = 'loaded';
    this.#client.emit('pluginLoad', this);
  }

  /** @internal */
  _drop(): void {
    for (const registered of [...this.#registered].reverse()) registered.unregister();
    this.#registered = [];
    this.#state = 'unloaded';
  }

  async #build(): Promise<RegisteredBrick[]> {
    const definition = this.#definition;
    let bricks: unknown[];
    try {
      bricks = [...(await definition.bricks(this.#client, definition.options))];
    } catch (error) {
      throw this.#failure(error);
    }
    const issues: LoadIssue[] = [];
    bricks.forEach((brick, index) => {
      if (!isBrick(brick)) {
        issues.push({ brick: `${this.name} › bricks[${index}]`, message: 'is not a meshcore.js builder' });
      } else if (brick[BRICK] === 'plugin') {
        issues.push({ brick: `${this.name} › bricks[${index}]`, message: 'a plugin cannot contain a plugin' });
      }
    });
    if (issues.length > 0) throw new LoadError(issues);
    const registered = this.#client.registry.registerAll(bricks.map((brick) => ({ brick, plugin: this.name })));
    if (this.#client.status !== 'idle') {
      const problems = this.#client.registry.validate();
      if (problems.length > 0) {
        for (const item of [...registered].reverse()) item.unregister();
        throw new LoadError(problems);
      }
    }
    return registered;
  }

  #failure(error: unknown): LoadError {
    if (error instanceof LoadError) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (!this.#definition.configured && error instanceof TypeError) {
      return new LoadError([
        { brick: `${this.name} › options`, message: `configure() is missing (bricks failed: ${message})` },
      ]);
    }
    return new LoadError([{ brick: `${this.name} › bricks`, message }]);
  }
}
