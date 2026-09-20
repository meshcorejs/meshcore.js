import type { Client } from '../client/client.js';
import { MeshcoreError } from '../errors.js';
import type { Logger } from '../logger.js';
import type { MessageContent } from '../messages/send-queue.js';
import type { SentMessage } from '../messages/sent-message.js';
import type { PermissionLike } from '../permissions/permission-builder.js';
import type { Permission } from '../permissions/permission-manager.js';
import type { Role } from '../permissions/role.js';
import type { Channel } from '../structures/channel.js';
import type { Contact } from '../structures/contact.js';
import type { Author, Message } from '../structures/message.js';
import type { Command } from './command.js';

/** Why a command was refused; every refusal emits `commandDenied` with one of these. */
export type DenyReason =
  | { type: 'unknownCommand'; name: string }
  | { type: 'scope' }
  | { type: 'backlog'; ageSeconds: number }
  | { type: 'channelUntrusted' }
  | { type: 'missingPermissions'; missing: Permission[] }
  | { type: 'cooldown'; remainingSeconds: number }
  | { type: 'invalidArguments'; error: Error };

/** What `commandDenied` hands the listener: the triggering message and, if it matched a name, the `Command`. */
export interface DeniedContext {
  readonly client: Client;
  readonly message: Message;
  readonly author: Author;
  readonly channel: Channel | null;
  readonly isDM: boolean;
  readonly command: Command | null;
}

/** Handed to a command's handler: the parsed `args`, the triggering `message`, `reply()`, and permission checks. */
export class CommandContext<Args extends object = Record<string, unknown>> {
  readonly client: Client;
  readonly command: Command;
  readonly message: Message;
  readonly args: Args;
  readonly logger: Logger;

  /**
   * @param client Owning client
   * @param command Command being run
   * @param message Message that triggered it
   * @param args Parsed arguments
   */
  constructor(client: Client, command: Command, message: Message, args: Args) {
    this.client = client;
    this.command = command;
    this.message = message;
    this.args = args;
    const prefix = `/${command.name}: `;
    this.logger = {
      debug: (m, ...meta) => client.logger.debug(prefix + m, ...meta),
      info: (m, ...meta) => client.logger.info(prefix + m, ...meta),
      warn: (m, ...meta) => client.logger.warn(prefix + m, ...meta),
      error: (m, ...meta) => client.logger.error(prefix + m, ...meta),
    };
  }

  get author(): Author {
    return this.message.author;
  }

  get channel(): Channel | null {
    return this.message.channel;
  }

  get isDM(): boolean {
    return this.message.isDM;
  }

  /**
   * @param content Text or MessageBuilder
   * @param options mention prefixes the author on a channel. Default true
   */
  reply(content: MessageContent, options: { mention?: boolean } = {}): Promise<SentMessage> {
    return this.message.reply(content, options);
  }

  /** @param permission Permission to check for the author */
  can(permission: PermissionLike): Promise<boolean> {
    return this.client.permissions.has(this.author, permission);
  }

  /** @param role Role the author wants to give or take */
  canManageRole(role: Role): Promise<boolean> {
    return this.client.permissions.canManageRole(this.author, role);
  }

  /** @param contact Contact the author wants to act on */
  canManageContact(contact: Contact): Promise<boolean> {
    return this.client.permissions.canManageContact(this.author, contact);
  }

  /** @param content Text or MessageBuilder, sent to the author as a DM */
  replyDM(content: MessageContent): Promise<SentMessage> {
    const author = this.message.author;
    if (!author.verified) {
      return Promise.reject(
        new MeshcoreError('UNVERIFIED_AUTHOR', 'cannot DM the unverified author of a channel message'),
      );
    }
    return author.send(content);
  }
}
