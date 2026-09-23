import { type ChannelRecord, PUBLIC_CHANNEL_SECRET, toHex } from '@meshcorejs/protocol';
import type { Client } from '../client/client.js';
import type { MessageContent } from '../messages/send-queue.js';
import type { SentMessage } from '../messages/sent-message.js';

/** A cached channel slot: name, secret, and `send()` to broadcast on it. */
export class Channel {
  readonly client: Client;
  #record: ChannelRecord;

  /**
   * @param client Owning client
   * @param record Channel as decoded from the radio
   */
  constructor(client: Client, record: ChannelRecord) {
    this.client = client;
    this.#record = record;
  }

  get index(): number {
    return this.#record.index;
  }

  get name(): string {
    return this.#record.name;
  }

  get secret(): Uint8Array {
    return this.#record.secret;
  }

  get isHashtag(): boolean {
    return this.#record.name.startsWith('#');
  }

  /** True for the firmware's built-in Public channel, identified by its secret (a renamed Public is still Public). */
  get isPublic(): boolean {
    const secret = this.#record.secret;
    return (
      secret.length === PUBLIC_CHANNEL_SECRET.length && secret.every((byte, i) => byte === PUBLIC_CHANNEL_SECRET[i])
    );
  }

  /** @param content Text or MessageBuilder */
  send(content: MessageContent): Promise<SentMessage> {
    return this.client.sendQueue.send(this, content);
  }

  /** @internal */
  _patch(record: ChannelRecord): void {
    this.#record = record;
  }

  /** @internal */
  _equals(record: ChannelRecord): boolean {
    return this.#record.name === record.name && toHex(this.#record.secret) === toHex(record.secret);
  }

  toString(): string {
    return this.name;
  }
}
