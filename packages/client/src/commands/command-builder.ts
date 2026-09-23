import { BRICK, type Brick } from '../bricks/brick.js';
import { LoadError, type LoadIssue } from '../errors.js';
import { type PermissionLike, permissionName } from '../permissions/permission-builder.js';
import {
  type ArgBuilder,
  ArgBuilder as ArgBuilderClass,
  type ArgDefinition,
  type ArgType,
  type ArgValue,
} from './args.js';
import type {
  CommandDefinition,
  CommandErrorHandler,
  CommandHandler,
  CommandScope,
  UsageErrorHandler,
} from './command.js';
import type { CommandContext } from './context.js';

export const COMMAND_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
export const RESERVED_COMMAND_NAMES = ['help', 'plugins', 'jobs'] as const;
export const DEFAULT_MAX_AGE_SECONDS = 300;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type WithArg<Args, N extends string, V, R extends boolean> = Simplify<
  Args & { [K in N]: R extends true ? V : V | undefined }
>;

/**
 * Declares a command. Chain `setName`, `setDescription`, `addArg`…, `setHandler`, then `build()` — which throws
 * a `LoadError` listing every problem. Triggered by `/name` in DM and `@Bot name` on channels; this rule is
 * fixed.
 */
// biome-ignore lint/complexity/noBannedTypes: {} is the identity of the Args accumulation
export class CommandBuilder<Args extends object = {}> implements Brick<CommandDefinition> {
  readonly [BRICK] = 'command' as const;
  #name = '';
  #description = '';
  readonly #aliases: string[] = [];
  readonly #args: ArgBuilder<ArgType, string, boolean, string>[] = [];
  #scopes: CommandScope[] = ['dm', 'channel'];
  #cooldownSeconds = 0;
  #maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS;
  readonly #requiredPermissions: PermissionLike[] = [];
  #handler: CommandHandler | null = null;
  #usageErrorHandler: UsageErrorHandler | null = null;
  #errorHandler: CommandErrorHandler | null = null;
  readonly #core: boolean;

  /** @param options core marks a built-in command that may use a reserved name */
  constructor(options: { core?: boolean } = {}) {
    this.#core = options.core ?? false;
  }

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

  /** @param aliases Alternative names, same rules as the name */
  addAliases(...aliases: string[]): this {
    this.#aliases.push(...aliases);
    return this;
  }

  /** @param configure Receives the string argument builder and returns it */
  addStringArg<const N extends string, const R extends boolean>(
    configure: (arg: ArgBuilder<'string'>) => ArgBuilder<'string', N, R>,
  ): CommandBuilder<WithArg<Args, N, string, R>> {
    return this.#addArg('string', configure);
  }

  /** @param configure Receives the integer argument builder and returns it */
  addIntegerArg<const N extends string, const R extends boolean>(
    configure: (arg: ArgBuilder<'integer'>) => ArgBuilder<'integer', N, R>,
  ): CommandBuilder<WithArg<Args, N, number, R>> {
    return this.#addArg('integer', configure);
  }

  /** @param configure Receives the number argument builder and returns it */
  addNumberArg<const N extends string, const R extends boolean>(
    configure: (arg: ArgBuilder<'number'>) => ArgBuilder<'number', N, R>,
  ): CommandBuilder<WithArg<Args, N, number, R>> {
    return this.#addArg('number', configure);
  }

  /** @param configure Receives the boolean argument builder and returns it */
  addBooleanArg<const N extends string, const R extends boolean>(
    configure: (arg: ArgBuilder<'boolean'>) => ArgBuilder<'boolean', N, R>,
  ): CommandBuilder<WithArg<Args, N, boolean, R>> {
    return this.#addArg('boolean', configure);
  }

  /** @param configure Receives the choice argument builder and returns it */
  addChoiceArg<const N extends string, const R extends boolean, const C extends string>(
    configure: (arg: ArgBuilder<'choice'>) => ArgBuilder<'choice', N, R, C>,
  ): CommandBuilder<WithArg<Args, N, C, R>> {
    return this.#addArg('choice', configure);
  }

  /** @param configure Receives the contact argument builder and returns it */
  addContactArg<const N extends string, const R extends boolean>(
    configure: (arg: ArgBuilder<'contact'>) => ArgBuilder<'contact', N, R>,
  ): CommandBuilder<WithArg<Args, N, ArgValue<'contact'>, R>> {
    return this.#addArg('contact', configure);
  }

  /** @param configure Receives the role argument builder and returns it */
  addRoleArg<const N extends string, const R extends boolean>(
    configure: (arg: ArgBuilder<'role'>) => ArgBuilder<'role', N, R>,
  ): CommandBuilder<WithArg<Args, N, ArgValue<'role'>, R>> {
    return this.#addArg('role', configure);
  }

  /** @param configure Receives the channel argument builder and returns it */
  addChannelArg<const N extends string, const R extends boolean>(
    configure: (arg: ArgBuilder<'channel'>) => ArgBuilder<'channel', N, R>,
  ): CommandBuilder<WithArg<Args, N, ArgValue<'channel'>, R>> {
    return this.#addArg('channel', configure);
  }

  /** @param scopes dm, channel and/or public. Default dm and channel; public must be opted in explicitly */
  setScope(...scopes: CommandScope[]): this {
    this.#scopes = [...new Set(scopes)];
    return this;
  }

  /** @param seconds Delay between two runs by the same author. Default 0 */
  setCooldown(seconds: number): this {
    this.#cooldownSeconds = seconds;
    return this;
  }

  /** @param seconds Backlog messages older than this are ignored. Default 300 */
  setMaxAge(seconds: number): this {
    this.#maxAgeSeconds = seconds;
    return this;
  }

  /** @param permissions Permissions the author needs, all of them */
  setRequiredPermissions(...permissions: PermissionLike[]): this {
    this.#requiredPermissions.push(...permissions);
    return this;
  }

  /** @param handler Builds the reply to an invalid argument */
  setUsageErrorHandler(handler: UsageErrorHandler): this {
    this.#usageErrorHandler = handler;
    return this;
  }

  /** @param handler Builds the reply when the handler throws */
  setErrorHandler(handler: CommandErrorHandler): this {
    this.#errorHandler = handler;
    return this;
  }

  /** @param handler Runs the command with its typed context */
  setHandler(handler: (ctx: CommandContext<Args>) => unknown): this {
    this.#handler = handler as CommandHandler;
    return this;
  }

  build(): CommandDefinition {
    const name = this.#name.toLowerCase();
    const brick = `command "${name || '?'}"`;
    const problems: string[] = [];

    if (!COMMAND_NAME_PATTERN.test(name)) problems.push(`name must match ${COMMAND_NAME_PATTERN}`);
    const aliases = this.#aliases.map((alias) => alias.toLowerCase());
    for (const alias of aliases) {
      if (!COMMAND_NAME_PATTERN.test(alias)) problems.push(`alias "${alias}" must match ${COMMAND_NAME_PATTERN}`);
    }
    if (!this.#core) {
      for (const reserved of RESERVED_COMMAND_NAMES) {
        if (name === reserved || aliases.includes(reserved))
          problems.push(`"${reserved}" is reserved by the built-in commands`);
      }
    }
    if (new Set(aliases).size !== aliases.length || aliases.includes(name)) problems.push('duplicate alias');
    if (this.#scopes.length === 0) problems.push('setScope() needs at least one scope');
    if (!Number.isFinite(this.#cooldownSeconds) || this.#cooldownSeconds < 0) problems.push('cooldown must be >= 0');
    if (!Number.isFinite(this.#maxAgeSeconds) || this.#maxAgeSeconds <= 0) problems.push('maxAge must be > 0');
    if (!this.#handler) problems.push('setHandler() is required');

    const args: ArgDefinition[] = [];
    let optionalSeen: string | null = null;
    const names = new Set<string>();
    this.#args.forEach((builder, index) => {
      const { definition, problems: argProblems } = builder.build();
      problems.push(...argProblems);
      if (names.has(definition.name)) problems.push(`duplicate argument "${definition.name}"`);
      names.add(definition.name);
      if (definition.required && optionalSeen !== null) {
        problems.push(`required argument "${definition.name}" after optional argument "${optionalSeen}"`);
      }
      if (!definition.required && optionalSeen === null) optionalSeen = definition.name;
      if (definition.rest && index !== this.#args.length - 1) {
        problems.push(`argument "${definition.name}" uses setRest() but is not the last argument`);
      }
      args.push(definition);
    });

    if (problems.length > 0) {
      throw new LoadError(problems.map((message): LoadIssue => ({ brick, message })));
    }
    return {
      name,
      description: this.#description,
      aliases,
      args,
      scopes: [...this.#scopes],
      cooldownSeconds: this.#cooldownSeconds,
      maxAgeSeconds: this.#maxAgeSeconds,
      requiredPermissions: [...new Set(this.#requiredPermissions.map(permissionName))],
      handler: this.#handler as CommandHandler,
      usageErrorHandler: this.#usageErrorHandler,
      errorHandler: this.#errorHandler,
      core: this.#core,
    };
  }

  #addArg<T extends ArgType>(
    type: T,
    configure: (arg: ArgBuilder<T>) => ArgBuilder<T, string, boolean, string>,
    // biome-ignore lint/suspicious/noExplicitAny: the public addXArg overloads narrow it
  ): CommandBuilder<any> {
    this.#args.push(configure(new ArgBuilderClass(type)) as unknown as ArgBuilder<ArgType, string, boolean, string>);
    return this;
  }
}
