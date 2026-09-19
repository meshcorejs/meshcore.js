import { BRICK, type Brick, isBrick } from '../bricks/brick.js';
import type { Client } from '../client/client.js';
import { LoadError } from '../errors.js';

export const PLUGIN_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;

export type PluginBricksFactory<Options> = (
  client: Client,
  options: Options,
) => Iterable<Brick> | Promise<Iterable<Brick>>;

export interface PluginDefinition<Options = unknown> {
  name: string;
  description: string | undefined;
  bricks: PluginBricksFactory<Options>;
  options: Options | undefined;
  configured: boolean;
}

export class PluginBuilder<Options = void> implements Brick<PluginDefinition<Options>> {
  readonly [BRICK] = 'plugin' as const;
  #name = '';
  #description: string | undefined;
  #bricks: PluginBricksFactory<Options> | null = null;
  #static: unknown[] | null = null;
  #options: Options | undefined;
  #configured = false;

  /** @param name Lowercase, letters digits _ and -, 1 to 32 characters */
  setName(name: string): this {
    this.#name = name;
    return this;
  }

  /** @param description Free text for the bot author */
  setDescription(description: string): this {
    this.#description = description;
    return this;
  }

  /** @param factory Receives the client and the options, returns the bricks */
  setBricks(factory: PluginBricksFactory<Options>): this {
    this.#bricks = factory;
    return this;
  }

  /** @param bricks Static list of bricks */
  addBricks(...bricks: Brick[]): this {
    this.#static = [...(this.#static ?? []), ...bricks];
    return this;
  }

  /** @param options Options given to the factory */
  configure(this: Options extends void ? never : PluginBuilder<Options>, options: Options): PluginBuilder<Options> {
    const self = this as PluginBuilder<Options>;
    const copy = new PluginBuilder<Options>();
    copy.#name = self.#name;
    copy.#description = self.#description;
    copy.#bricks = self.#bricks;
    copy.#static = self.#static ? [...self.#static] : null;
    copy.#options = options;
    copy.#configured = true;
    return copy;
  }

  build(): PluginDefinition<Options> {
    const problems: string[] = [];
    if (!PLUGIN_NAME_PATTERN.test(this.#name)) problems.push(`name must match ${PLUGIN_NAME_PATTERN}`);
    if (this.#bricks && this.#static) problems.push('use either setBricks() or addBricks(), not both');
    if (!this.#bricks && !this.#static) problems.push('setBricks() or addBricks() is required');
    if (this.#static) {
      if (this.#static.some((brick) => isBrick(brick) && brick[BRICK] === 'plugin')) {
        problems.push('a plugin cannot contain a plugin');
      }
      if (this.#static.some((brick) => !isBrick(brick))) problems.push('addBricks() only accepts meshcore.js builders');
    }
    if (problems.length > 0) {
      throw new LoadError(problems.map((message) => ({ brick: `plugin "${this.#name || '?'}"`, message })));
    }
    const staticBricks = this.#static ? ([...this.#static] as Brick[]) : null;
    return Object.freeze({
      name: this.#name,
      description: this.#description,
      bricks: this.#bricks ?? (() => staticBricks as Brick[]),
      options: this.#options,
      configured: this.#configured,
    });
  }
}
