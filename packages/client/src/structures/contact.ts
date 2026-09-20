import { type ContactRecord, ContactType, type Path, toHex } from '@meshcorejs/protocol';
import type { Client } from '../client/client.js';
import type { MessageContent } from '../messages/send-queue.js';
import type { SentMessage } from '../messages/sent-message.js';

/** What kind of node a `Contact` is, decoded from the radio's contact type. */
export type ContactKind = 'none' | 'chat' | 'repeater' | 'room' | 'sensor';

const KINDS: Record<number, ContactKind> = {
  [ContactType.None]: 'none',
  [ContactType.Chat]: 'chat',
  [ContactType.Repeater]: 'repeater',
  [ContactType.Room]: 'room',
  [ContactType.Sensor]: 'sensor',
};

/** A cached entry from the radio's contact table: identity, path, location, and `send()` for direct messages. */
export class Contact {
  readonly client: Client;
  readonly verified = true as const;
  #record: ContactRecord;

  /**
   * @param client Owning client
   * @param record Contact as decoded from the radio
   */
  constructor(client: Client, record: ContactRecord) {
    this.client = client;
    this.#record = record;
  }

  get record(): Readonly<ContactRecord> {
    return this.#record;
  }

  get publicKey(): string {
    return this.#record.publicKey;
  }

  get shortKey(): string {
    return this.#record.publicKey.slice(0, 12);
  }

  get name(): string {
    return this.#record.name;
  }

  get type(): ContactKind {
    return KINDS[this.#record.type] ?? 'none';
  }

  get path(): Path | null {
    return this.#record.outPath;
  }

  get lastAdvert(): Date {
    return new Date(this.#record.lastAdvertTimestamp * 1000);
  }

  get lastSeen(): Date {
    return new Date(this.#record.lastModified * 1000);
  }

  get location(): { latitude: number; longitude: number } | null {
    const { latitude, longitude } = this.#record;
    return latitude === 0 && longitude === 0 ? null : { latitude, longitude };
  }

  /** @param content Text or MessageBuilder */
  send(content: MessageContent): Promise<SentMessage> {
    return this.client.sendQueue.send(this, content);
  }

  /** @internal */
  _patch(record: ContactRecord): void {
    this.#record = record;
  }

  /** @internal */
  _equals(record: ContactRecord): boolean {
    const a = this.#record;
    const pathKey = (r: ContactRecord) =>
      r.outPath === null ? 'flood' : `${r.outPath.hashSize}:${r.outPath.hops.map((hop) => toHex(hop)).join(',')}`;
    return (
      a.name === record.name &&
      a.type === record.type &&
      a.flags === record.flags &&
      a.lastAdvertTimestamp === record.lastAdvertTimestamp &&
      a.lastModified === record.lastModified &&
      a.latitude === record.latitude &&
      a.longitude === record.longitude &&
      pathKey(a) === pathKey(record)
    );
  }

  toString(): string {
    return this.name;
  }
}
