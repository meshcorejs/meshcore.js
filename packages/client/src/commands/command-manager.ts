import { MessageBuilder } from '../builders/message-builder.js';
import type { Client } from '../client/client.js';
import { Collection } from '../collection.js';
import type { LoadIssue } from '../errors.js';
import type { MessageContent } from '../messages/send-queue.js';
import type { Permission } from '../permissions/permission-manager.js';
import type { Message } from '../structures/message.js';
import { Command, type CommandDefinition, formatUsage } from './command.js';
import { CommandContext, type DeniedContext, type DenyReason } from './context.js';
import { ArgumentError, parseArgs } from './parse-args.js';
import { parseTrigger } from './trigger.js';

export const HELPER_MAX_PARTS = 3;

export class CommandManager {
  readonly client: Client;
  readonly cache = new Collection<string, Command>();
  readonly #all: Command[] = [];
  readonly #cooldowns = new Map<string, number>();
  #inFlight = 0;

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
    client.on('messageCreate', (message) => {
      this.#inFlight++;
      this.handle(message)
        .catch((error: unknown) => client._reportError(error, { type: 'internal', name: 'commands' }))
        .finally(() => {
          this.#inFlight--;
        });
    });
  }

  get size(): number {
    return this.cache.size;
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  /** @param nameOrAlias Command name or alias */
  get(nameOrAlias: string): Command | undefined {
    const key = nameOrAlias.toLowerCase();
    return this.cache.get(key) ?? this.cache.find((command) => command.aliases.includes(key));
  }

  /** @internal */
  add(definition: CommandDefinition): Command {
    const command = new Command(definition);
    this.#all.push(command);
    this.#rebuildCache();
    return command;
  }

  /** @internal */
  remove(command: Command): void {
    const index = this.#all.indexOf(command);
    if (index === -1) return;
    this.#all.splice(index, 1);
    this.#rebuildCache();
  }

  #rebuildCache(): void {
    this.cache.clear();
    const ordered = [...this.#all.filter((c) => !c.core), ...this.#all.filter((c) => c.core)];
    for (const command of ordered) if (!this.cache.has(command.name)) this.cache.set(command.name, command);
  }

  /** @internal */
  validate(): LoadIssue[] {
    const issues: LoadIssue[] = [];
    const owners = new Map<string, string>();
    for (const command of this.#all) {
      for (const permission of command.requiredPermissions) {
        if (!this.client.permissions.get(permission)) {
          issues.push({ brick: `command "${command.name}"`, message: `unknown permission "${permission}"` });
        }
      }
      for (const trigger of [command.name, ...command.aliases]) {
        const owner = owners.get(trigger);
        if (owner)
          issues.push({
            brick: `command "${command.name}"`,
            message: `"${trigger}" is already used by command "${owner}"`,
          });
        else owners.set(trigger, command.name);
      }
    }
    return issues;
  }

  /** @internal */
  async handle(message: Message): Promise<void> {
    const trigger = parseTrigger(message.content, message.isDM, this.client.self.name);
    if (!trigger) return;
    if (trigger.type === 'helper') {
      await this.#sendHelper(message);
      return;
    }

    const command = this.get(trigger.name);
    if (!command) {
      await this.#deny(
        message,
        null,
        { type: 'unknownCommand', name: trigger.name },
        message.isDM ? this.client.replies.unknownCommandDM : this.client.replies.unknownCommandChannel,
      );
      return;
    }
    if (!command.allows(message.isDM ? 'dm' : 'channel')) {
      await this.#deny(message, command, { type: 'scope' });
      return;
    }
    const ageSeconds = Math.floor((Date.now() - message.createdAt.getTime()) / 1000);
    if (message.backlog && ageSeconds > command.maxAgeSeconds) {
      await this.#deny(message, command, { type: 'backlog', ageSeconds });
      return;
    }

    if (command.requiredPermissions.length > 0) {
      if (!message.isDM) {
        await this.#deny(message, command, { type: 'channelUntrusted' }, this.client.replies.channelUntrusted);
        return;
      }
      let missing: Permission[];
      try {
        missing = await this.client.permissions.missing(message.author, [...command.requiredPermissions]);
      } catch (error) {
        this.client._reportError(error, { type: 'internal', name: 'permissions' });
        await this.#safeReply(message, this.client.replies.internalError);
        return;
      }
      if (missing.length > 0) {
        await this.#deny(
          message,
          command,
          { type: 'missingPermissions', missing },
          this.client.replies.missingPermissions,
        );
        return;
      }
    }

    const cooldownKey = `${command.name}:${message.author.verified ? message.author.publicKey : `name:${message.author.name}`}`;
    const until = this.#cooldowns.get(cooldownKey) ?? 0;
    if (until > Date.now()) {
      const remainingSeconds = Math.ceil((until - Date.now()) / 1000);
      await this.#deny(
        message,
        command,
        { type: 'cooldown', remainingSeconds },
        this.client.replies.cooldown(remainingSeconds),
      );
      return;
    }

    const usage = formatUsage(command, message.isDM, this.client.self.name);
    let args: Record<string, unknown>;
    try {
      args = parseArgs(this.client, command.args, trigger.argsText);
    } catch (error) {
      if (!(error instanceof ArgumentError)) throw error;
      const ctx = new CommandContext(this.client, command, message, {});
      const reply =
        command.definition.usageErrorHandler?.(ctx, error) ??
        (error.reason === 'tooMany'
          ? this.client.replies.tooManyArguments(usage)
          : error.reason === 'missing'
            ? this.client.replies.missingArgument(error.arg?.name ?? '', usage)
            : this.client.replies.invalidArgument(error.arg?.name ?? '', usage));
      await this.#deny(message, command, { type: 'invalidArguments', error }, reply);
      return;
    }

    if (command.cooldownSeconds > 0) this.#cooldowns.set(cooldownKey, Date.now() + command.cooldownSeconds * 1000);
    const ctx = new CommandContext(this.client, command, message, args);
    this.client.emit('commandRun', ctx);
    try {
      await command.definition.handler(ctx);
    } catch (error) {
      if (this.client.listenerCount('commandError') > 0)
        this.client.emit('commandError', error instanceof Error ? error : new Error(String(error)), ctx);
      else this.client._reportError(error, { type: 'command', name: command.name });
      const reply = command.definition.errorHandler?.(ctx, error) ?? this.client.replies.internalError;
      await this.#safeReply(message, reply);
    }
  }

  async #sendHelper(message: Message): Promise<void> {
    const scope = message.isDM ? 'dm' : 'channel';
    const lines: string[] = [];
    for (const command of this.cache.values()) {
      if (!command.allows(scope)) continue;
      if (command.requiredPermissions.length > 0) {
        if (!message.isDM) continue;
        const missing = await this.client.permissions.missing(message.author, [...command.requiredPermissions]);
        if (missing.length > 0) continue;
      }
      lines.push(formatUsage(command, message.isDM, this.client.self.name));
    }
    const reply =
      lines.length === 0
        ? this.client.replies.noCommands
        : new MessageBuilder().addLines(lines).setOverflow('split', { maxParts: HELPER_MAX_PARTS });
    await this.#safeReply(message, reply);
  }

  async #deny(message: Message, command: Command | null, reason: DenyReason, reply?: MessageContent): Promise<void> {
    const ctx: DeniedContext = {
      client: this.client,
      message,
      author: message.author,
      channel: message.channel,
      isDM: message.isDM,
      command,
    };
    this.client.emit('commandDenied', ctx, reason);
    if (reply !== undefined) await this.#safeReply(message, reply);
  }

  async #safeReply(message: Message, content: MessageContent): Promise<void> {
    try {
      await message.reply(content);
    } catch (error) {
      this.client._reportError(error, { type: 'internal', name: 'commands' });
    }
  }
}
