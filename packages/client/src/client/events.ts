import type { DecodedFrame } from '@meshcorejs/protocol';
import type { CommandContext, DeniedContext, DenyReason } from '../commands/context.js';
import type { DeliveryFailedError } from '../errors.js';
import type { Advert } from '../managers/contact-manager.js';
import type { SentMessage } from '../messages/sent-message.js';
import type { Plugin } from '../plugins/plugin.js';
import type { Channel } from '../structures/channel.js';
import type { Contact } from '../structures/contact.js';
import type { Message } from '../structures/message.js';

/** Where an error reported through the `error` event originated: which kind of brick, and its name if any. */
export interface ErrorSource {
  type: 'command' | 'event' | 'job' | 'plugin' | 'internal';
  name?: string;
}

/** Every `client.on(...)` event with its arguments. */
export interface ClientEvents extends Record<string, unknown[]> {
  ready: [];
  disconnect: [error?: Error];
  reconnecting: [attempt: number, delayMs: number];
  error: [error: Error, source: ErrorSource];
  messageCreate: [message: Message];
  messageDelivered: [sent: SentMessage];
  messageFailed: [sent: SentMessage, error: DeliveryFailedError];
  advert: [advert: Advert];
  contactAdd: [contact: Contact];
  contactUpdate: [oldContact: Contact, newContact: Contact];
  contactRemove: [contact: Contact];
  contactsFull: [];
  channelUpdate: [oldChannel: Channel | null, newChannel: Channel | null];
  commandRun: [ctx: CommandContext];
  commandError: [error: Error, ctx: CommandContext];
  commandDenied: [ctx: DeniedContext, reason: DenyReason];
  pluginLoad: [plugin: Plugin];
  pluginUnload: [plugin: Plugin];
  raw: [frame: DecodedFrame];
}
