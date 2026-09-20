import type { MessageBuilder } from '../builders/message-builder.js';
import type { ArgDefinition } from './args.js';
import type { CommandContext } from './context.js';
import type { ArgumentError } from './parse-args.js';

/** Where a command may be triggered: direct message, channel, or both. */
export type CommandScope = 'dm' | 'channel';

/** `CommandBuilder.setHandler()`'s callback, run once trigger, scope, permissions and cooldown pass. */
// biome-ignore lint/suspicious/noExplicitAny: handlers are type-erased
export type CommandHandler = (ctx: CommandContext<any>) => unknown;
/** `CommandBuilder.setUsageErrorHandler()`'s callback, run when argument parsing fails. */
// biome-ignore lint/suspicious/noExplicitAny: handlers are type-erased
export type UsageErrorHandler = (ctx: CommandContext<any>, error: ArgumentError) => string | MessageBuilder;
/** `CommandBuilder.setErrorHandler()`'s callback, run when the handler throws. */
// biome-ignore lint/suspicious/noExplicitAny: handlers are type-erased
export type CommandErrorHandler = (ctx: CommandContext<any>, error: unknown) => string | MessageBuilder;

/** Built definition of a command, produced by `CommandBuilder.build()`. */
export interface CommandDefinition {
  name: string;
  description: string;
  aliases: string[];
  args: ArgDefinition[];
  scopes: CommandScope[];
  cooldownSeconds: number;
  maxAgeSeconds: number;
  requiredPermissions: string[];
  handler: CommandHandler;
  usageErrorHandler: UsageErrorHandler | null;
  errorHandler: CommandErrorHandler | null;
  core: boolean;
}

/** A registered command's definition, exposed for the built-in helper and for introspection. */
export class Command {
  readonly name: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly args: readonly ArgDefinition[];
  readonly scopes: readonly CommandScope[];
  readonly cooldownSeconds: number;
  readonly maxAgeSeconds: number;
  readonly requiredPermissions: readonly string[];
  readonly core: boolean;
  /** @internal */
  readonly definition: CommandDefinition;

  /** @param definition Built by CommandBuilder */
  constructor(definition: CommandDefinition) {
    this.definition = definition;
    this.name = definition.name;
    this.description = definition.description;
    this.aliases = Object.freeze([...definition.aliases]);
    this.args = Object.freeze([...definition.args]);
    this.scopes = Object.freeze([...definition.scopes]);
    this.cooldownSeconds = definition.cooldownSeconds;
    this.maxAgeSeconds = definition.maxAgeSeconds;
    this.requiredPermissions = Object.freeze([...definition.requiredPermissions]);
    this.core = definition.core;
  }

  /** @param scope dm or channel */
  allows(scope: CommandScope): boolean {
    return this.scopes.includes(scope);
  }
}

export function formatUsage(command: Command, isDM: boolean, botName: string): string {
  const args = command.args.map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`));
  const head = isDM ? `/${command.name}` : `@${botName} ${command.name}`;
  return [head, ...args].join(' ');
}
