import type { Client } from '../client/client.js';
import type { MessageContent } from '../messages/send-queue.js';
import type { SentMessage } from '../messages/sent-message.js';
import { mentionPrefix } from '../messages/text.js';
import type { Channel } from './channel.js';
import type { Contact } from './contact.js';

export interface UnverifiedAuthor {
  readonly name: string;
  readonly verified: false;
}

export type Author = Contact | UnverifiedAuthor;

export interface MessageData {
  content: string;
  senderTimestamp: number;
  snr: number | null;
  hopCount: number | null;
  backlog: boolean;
  author: Author;
  channel: Channel | null;
}

export class Message {
  readonly client: Client;
  readonly content: string;
  readonly createdAt: Date;
  readonly snr: number | null;
  readonly hopCount: number | null;
  readonly backlog: boolean;
  readonly author: Author;
  readonly channel: Channel | null;

  /**
   * @param client Owning client
   * @param data Decoded message fields
   */
  constructor(client: Client, data: MessageData) {
    this.client = client;
    this.content = data.content;
    this.createdAt = new Date(data.senderTimestamp * 1000);
    this.snr = data.snr;
    this.hopCount = data.hopCount;
    this.backlog = data.backlog;
    this.author = data.author;
    this.channel = data.channel;
  }

  get isDM(): boolean {
    return this.channel === null;
  }

  /**
   * @param content Text or MessageBuilder
   * @param options mention prefixes the author on a channel. Default true
   */
  reply(content: MessageContent, options: { mention?: boolean } = {}): Promise<SentMessage> {
    if (this.channel === null) return (this.author as Contact).send(content);
    const mention = (options.mention ?? true) && this.author.name !== '';
    return this.client.sendQueue.send(this.channel, content, {
      prefix: mention ? mentionPrefix(this.author.name) : '',
    });
  }
}

/** @param text Wire text of a channel message */
export function parseChannelText(text: string): { authorName: string; content: string } {
  const separator = text.indexOf(': ');
  if (separator === -1) return { authorName: '', content: text };
  return { authorName: text.slice(0, separator), content: text.slice(separator + 2) };
}
