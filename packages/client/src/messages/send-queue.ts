import { utf8ByteLength } from '@meshcorejs/protocol';
import { MessageBuilder } from '../builders/message-builder.js';
import type { Client } from '../client/client.js';
import { CommandTimeoutError, ConnectionError, DeliveryFailedError, MessageTooLongError } from '../errors.js';
import { Channel } from '../structures/channel.js';
import type { Contact } from '../structures/contact.js';
import { SentMessage } from './sent-message.js';
import { channelTextBudget, DM_TEXT_BUDGET } from './text.js';

/** What `contact.send()`, `channel.send()`, `ctx.reply()` and `SendQueue.send()` accept. */
export type MessageContent = string | MessageBuilder;

/** Minimum time between two transmissions on `SendQueue`, not configurable. */
export const SEND_INTERVAL_MS = 2000;
/** Resend attempts for a direct message before `SendQueue` resets the path and floods once, not configurable. */
export const DM_MAX_RESENDS = 3;
/** How long a queued message may wait for the radio before it fails with `DeliveryFailedError`, not configurable. */
export const SEND_EXPIRY_MS = 5 * 60_000;

interface QueuedPart {
  message: SentMessage;
  index: number;
  text: string;
  timestamp: number;
  attempt: number;
  floodRetried: boolean;
  enqueuedAt: number;
}

interface AckWait {
  part: QueuedPart;
  timer: ReturnType<typeof setTimeout>;
  acks: number[];
}

/** Options for `SendQueue.send()`: an extra `prefix` (a mention) counted in the target's byte budget. */
export interface SendOptions {
  prefix?: string;
}

/**
 * The only path to the air: paces transmissions, waits for DM acknowledgements, resends and floods, expires
 * messages the radio never got to.
 */
export class SendQueue {
  readonly #client: Client;
  readonly #parts: QueuedPart[] = [];
  readonly #acks = new Map<number, AckWait>();
  readonly #waits = new Map<QueuedPart, AckWait>();
  #lastSendAt = Number.NEGATIVE_INFINITY;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #busy = false;
  #closed = false;
  readonly #idleWaiters: Array<() => void> = [];

  /** @param client Owning client */
  constructor(client: Client) {
    this.#client = client;
  }

  get size(): number {
    return this.#parts.length;
  }

  get idle(): boolean {
    return this.#parts.length === 0 && !this.#busy;
  }

  /**
   * @param target Contact or channel
   * @param prefix Text counted in the budget, like a mention
   */
  budgetFor(target: Contact | Channel, prefix = ''): number {
    return target instanceof Channel ? channelTextBudget(this.#client.self.name, prefix) : DM_TEXT_BUDGET;
  }

  /**
   * @param target Contact or channel
   * @param content Text or MessageBuilder
   * @param options mention prefix for channel replies
   */
  async send(target: Contact | Channel, content: MessageContent, options: SendOptions = {}): Promise<SentMessage> {
    if (this.#closed) throw new ConnectionError('client destroyed');
    const prefix = target instanceof Channel ? (options.prefix ?? '') : '';
    const budget = this.budgetFor(target, prefix);
    let texts: string[];
    if (content instanceof MessageBuilder) {
      texts = content.build(budget);
    } else {
      const bytes = utf8ByteLength(content);
      if (content === '') throw new RangeError('cannot send an empty message');
      if (bytes > budget) throw new MessageTooLongError(bytes, budget);
      texts = [content];
    }
    const message = new SentMessage(
      target,
      texts.map((text) => `${prefix}${text}`),
    );
    const timestamp = Math.floor(Date.now() / 1000);
    message.parts.forEach((text, index) => {
      this.#parts.push({ message, index, text, timestamp, attempt: 0, floodRetried: false, enqueuedAt: Date.now() });
    });
    this.#pump();
    await message._whenSent();
    return message;
  }

  /** @internal */
  handleSendConfirmed(ack: number): void {
    const wait = this.#acks.get(ack);
    if (!wait) return;
    this.#clearWait(wait);
    if (wait.part.message._markPart(wait.part.index, 'delivered')) {
      this.#client.emit('messageDelivered', wait.part.message);
    }
  }

  /** @internal */
  resume(): void {
    this.#pump();
  }

  /** @param timeoutMs Time left to flush the queue */
  async close(timeoutMs: number): Promise<void> {
    if (this.#parts.length > 0 || this.#busy) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        this.#idleWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    const error = new DeliveryFailedError('destroyed', 'client destroyed before the message was delivered');
    for (const part of this.#parts.splice(0)) this.#fail(part.message, error);
    for (const wait of [...this.#waits.values()]) {
      this.#clearWait(wait);
      this.#fail(wait.part.message, error);
    }
  }

  #pump(): void {
    if (this.#busy || this.#timer || this.#closed) return;
    if (this.#parts.length === 0) {
      for (const resolve of this.#idleWaiters.splice(0)) resolve();
      return;
    }
    if (!this.#client.isReady) return;

    const part = this.#parts[0] as QueuedPart;
    if (Date.now() - part.enqueuedAt > SEND_EXPIRY_MS) {
      this.#parts.shift();
      this.#fail(part.message, new DeliveryFailedError('expired', 'message waited too long for the radio'));
      this.#pump();
      return;
    }
    const wait = this.#lastSendAt + SEND_INTERVAL_MS - Date.now();
    if (wait > 0) {
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#pump();
      }, wait);
      return;
    }

    this.#parts.shift();
    this.#busy = true;
    this.#transmit(part).finally(() => {
      this.#busy = false;
      this.#pump();
    });
  }

  async #transmit(part: QueuedPart): Promise<void> {
    const { message } = part;
    if (message.status === 'failed' || message._isPartDelivered(part.index)) return;
    try {
      if (message.target instanceof Channel) {
        await this.#client.radio.sendChannelText({
          channelIndex: message.target.index,
          text: part.text,
          timestamp: part.timestamp,
        });
        this.#lastSendAt = Date.now();
        message._markPart(part.index, 'sent');
        return;
      }
      const contact = message.target as Contact;
      const sent = await this.#client.radio.sendText({
        recipient: contact.publicKey,
        text: part.text,
        timestamp: part.timestamp,
        attempt: part.attempt,
      });
      this.#lastSendAt = Date.now();
      message._markPart(part.index, 'sent');
      this.#awaitAck(part, sent.expectedAck, sent.suggestedTimeoutMs, sent.flood);
    } catch (error) {
      if (error instanceof ConnectionError || error instanceof CommandTimeoutError) {
        this.#parts.unshift(part);
        return;
      }
      this.#fail(
        message,
        new DeliveryFailedError('radio', `radio refused the message: ${(error as Error).message}`, { cause: error }),
      );
    }
  }

  #awaitAck(part: QueuedPart, ack: number, timeoutMs: number, flood: boolean): void {
    const previous = this.#waits.get(part);
    if (previous) clearTimeout(previous.timer);
    const wait: AckWait = {
      part,
      acks: [...(previous?.acks ?? []), ack],
      timer: setTimeout(() => void this.#onAckTimeout(wait, flood), timeoutMs),
    };
    this.#waits.set(part, wait);
    for (const key of wait.acks) this.#acks.set(key, wait);
  }

  async #onAckTimeout(wait: AckWait, flood: boolean): Promise<void> {
    const { part } = wait;
    if (part.message.status === 'failed' || this.#closed) return;
    if (part.attempt < DM_MAX_RESENDS) {
      this.#parts.unshift({ ...part, attempt: part.attempt + 1 });
      this.#rekey(wait, part);
      this.#pump();
      return;
    }
    if (!flood && !part.floodRetried) {
      try {
        await this.#client.contacts.resetPath(part.message.target as Contact);
      } catch (error) {
        this.#client.logger.warn('could not reset the path before a flood retry', error);
      }
      this.#parts.unshift({ ...part, attempt: part.attempt + 1, floodRetried: true });
      this.#rekey(wait, part);
      this.#pump();
      return;
    }
    this.#clearWait(wait);
    this.#fail(part.message, new DeliveryFailedError('noAck', `no acknowledgement after ${part.attempt + 1} attempts`));
  }

  #rekey(wait: AckWait, oldPart: QueuedPart): void {
    const next = this.#parts[0] as QueuedPart;
    this.#waits.delete(oldPart);
    wait.part = next;
    this.#waits.set(next, wait);
  }

  #clearWait(wait: AckWait): void {
    clearTimeout(wait.timer);
    this.#waits.delete(wait.part);
    for (const key of wait.acks) this.#acks.delete(key);
  }

  #fail(message: SentMessage, error: DeliveryFailedError): void {
    if (message._fail(error)) this.#client.emit('messageFailed', message, error);
  }
}
