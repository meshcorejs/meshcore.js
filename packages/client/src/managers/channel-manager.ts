import { createHash } from 'node:crypto';
import { CHANNEL_SECRET_SIZE, type ChannelRecord, NAME_FIELD_SIZE, utf8ByteLength } from '@meshcorejs/protocol';
import type { Client } from '../client/client.js';
import { Collection } from '../collection.js';
import { LimitReachedError, MeshcoreError } from '../errors.js';
import { Channel } from '../structures/channel.js';

/** @param name Channel name starting with # */
export function hashtagChannelSecret(name: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(name, 'utf8').digest().subarray(0, CHANNEL_SECRET_SIZE));
}

export interface CreateChannelOptions {
  name: string;
  secret?: Uint8Array;
}

export class ChannelManager {
  readonly client: Client;
  readonly cache = new Collection<number, Channel>();

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
  }

  /** @param nameOrIndex Channel name or slot */
  get(nameOrIndex: string | number): Channel | undefined {
    if (typeof nameOrIndex === 'number') return this.cache.get(nameOrIndex);
    const name = nameOrIndex.toLowerCase();
    return this.cache.find((channel) => channel.name.toLowerCase() === name);
  }

  /** @param options emitEvents emits channelUpdate for the differences */
  async fetch(options: { emitEvents?: boolean } = {}): Promise<Collection<number, Channel>> {
    const emit = options.emitEvents ?? true;
    const slots = this.client.device.maxChannels ?? 8;
    for (let index = 0; index < slots; index++) {
      const record = await this.client.radio.getChannel(index);
      if (record === null) break;
      this._apply(index, record.name === '' ? null : record, emit);
    }
    return this.cache;
  }

  /** @param options name and optional secret, hashtag channels derive it */
  async create(options: CreateChannelOptions): Promise<Channel> {
    const name = options.secret || options.name.startsWith('#') ? options.name : `#${options.name}`;
    const secret = options.secret ?? hashtagChannelSecret(name);
    if (name === '' || utf8ByteLength(name) >= NAME_FIELD_SIZE) {
      throw new RangeError(`channel name must be 1..${NAME_FIELD_SIZE - 1} bytes`);
    }
    if (secret.length !== CHANNEL_SECRET_SIZE) {
      throw new RangeError(`channel secret must be ${CHANNEL_SECRET_SIZE} bytes`);
    }
    if (this.get(name)) throw new MeshcoreError('DUPLICATE_CHANNEL', `channel "${name}" already exists`);

    const slots = this.client.device.maxChannels ?? 8;
    let index = 0;
    while (index < slots && this.cache.has(index)) index++;
    if (index >= slots) throw new LimitReachedError('channels', slots);

    await this.client.radio.setChannel({ index, name, secret });
    this._apply(index, { index, name, secret }, true);
    return this.cache.get(index) as Channel;
  }

  /** @param channel Channel, name or slot */
  async delete(channel: Channel | string | number): Promise<void> {
    const target = channel instanceof Channel ? channel : this.get(channel);
    if (!target) return;
    await this.client.radio.setChannel({ index: target.index, name: '', secret: new Uint8Array(CHANNEL_SECRET_SIZE) });
    this._apply(target.index, null, true);
  }

  /** @internal */
  _apply(index: number, record: ChannelRecord | null, emit: boolean): void {
    const existing = this.cache.get(index);
    if (!record) {
      if (!existing) return;
      this.cache.delete(index);
      if (emit) this.client.emit('channelUpdate', existing, null);
      return;
    }
    if (!existing) {
      const channel = new Channel(this.client, record);
      this.cache.set(index, channel);
      if (emit) this.client.emit('channelUpdate', null, channel);
      return;
    }
    if (existing._equals(record)) return;
    const old = new Channel(this.client, { index, name: existing.name, secret: existing.secret });
    existing._patch(record);
    if (emit) this.client.emit('channelUpdate', old, existing);
  }
}
