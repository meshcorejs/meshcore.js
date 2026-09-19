import type { ContactRecord, PushFrame } from '@meshcorejs/protocol';
import type { Client } from '../client/client.js';
import { Collection } from '../collection.js';
import { Contact } from '../structures/contact.js';

const HEX = /^[0-9a-f]+$/;

export interface Advert {
  publicKey: string;
  name: string;
  contact: Contact | null;
  record: ContactRecord;
}

export class ContactManager {
  readonly client: Client;
  readonly cache = new Collection<string, Contact>();

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
  }

  /** @param keyOrPrefix Full key or a prefix of 12 hex characters or more */
  get(keyOrPrefix: string): Contact | undefined {
    const key = keyOrPrefix.toLowerCase();
    if (key.length < 12 || !HEX.test(key)) return undefined;
    if (key.length === 64) return this.cache.get(key);
    const matches = this.cache.filter((contact) => contact.publicKey.startsWith(key));
    return matches.size === 1 ? matches.first() : undefined;
  }

  /** @param options emitEvents emits contact events for the differences */
  async fetch(options: { emitEvents?: boolean } = {}): Promise<Collection<string, Contact>> {
    const emit = options.emitEvents ?? true;
    const records = await this.client.radio.getContacts();
    const seen = new Set<string>();
    for (const record of records) {
      seen.add(record.publicKey);
      this.#upsert(record, emit);
    }
    for (const [key, contact] of this.cache) {
      if (seen.has(key)) continue;
      this.cache.delete(key);
      if (emit) this.client.emit('contactRemove', contact);
    }
    return this.cache;
  }

  /** @param contact Contact or public key */
  async remove(contact: Contact | string): Promise<void> {
    const target = typeof contact === 'string' ? this.get(contact) : contact;
    if (!target) return;
    await this.client.radio.removeContact(target.publicKey);
    if (this.cache.delete(target.publicKey)) this.client.emit('contactRemove', target);
  }

  /** @param contact Contact to flood again */
  async resetPath(contact: Contact): Promise<void> {
    await this.client.radio.resetPath(contact.publicKey);
    this._patchFromRadio(await this.client.radio.getContactByKey(contact.publicKey), contact.publicKey);
  }

  /** @internal */
  async _handlePush(frame: PushFrame): Promise<void> {
    switch (frame.type) {
      case 'advert': {
        const record = await this.client.radio.getContactByKey(frame.publicKey);
        const contact = this._patchFromRadio(record, frame.publicKey);
        if (record && contact) {
          this.client.emit('advert', { publicKey: record.publicKey, name: record.name, contact, record });
        }
        return;
      }
      case 'newAdvert':
        this.client.emit('advert', {
          publicKey: frame.contact.publicKey,
          name: frame.contact.name,
          contact: null,
          record: frame.contact,
        });
        return;
      case 'pathUpdated':
        this._patchFromRadio(await this.client.radio.getContactByKey(frame.publicKey), frame.publicKey);
        return;
      case 'contactDeleted': {
        const contact = this.cache.get(frame.publicKey);
        if (contact && this.cache.delete(frame.publicKey)) this.client.emit('contactRemove', contact);
        return;
      }
      case 'contactsFull':
        this.client.emit('contactsFull');
        return;
      default:
        return;
    }
  }

  /** @internal */
  _patchFromRadio(record: ContactRecord | null, publicKey: string): Contact | undefined {
    if (record) return this.#upsert(record, true);
    const contact = this.cache.get(publicKey);
    if (contact && this.cache.delete(publicKey)) this.client.emit('contactRemove', contact);
    return undefined;
  }

  #upsert(record: ContactRecord, emit: boolean): Contact {
    const existing = this.cache.get(record.publicKey);
    if (!existing) {
      const contact = new Contact(this.client, record);
      this.cache.set(record.publicKey, contact);
      if (emit) this.client.emit('contactAdd', contact);
      return contact;
    }
    if (!existing._equals(record)) {
      const old = new Contact(this.client, existing.record);
      existing._patch(record);
      if (emit) this.client.emit('contactUpdate', old, existing);
    }
    return existing;
  }
}
