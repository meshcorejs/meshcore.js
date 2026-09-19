import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Advert } from '../src/managers/contact-manager.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const julie = fakeContactRecord({ name: 'Julie', latitude: 45.76, longitude: 4.83 });
const marc = fakeContactRecord({ name: 'Marc', type: 2 });

describe('ContactManager', () => {
  it('looks contacts up by full key or unique prefix', async () => {
    const { client } = await setupClient({ contacts: [julie, marc] });
    expect(client.contacts.get(julie.publicKey)?.name).toBe('Julie');
    expect(client.contacts.get(julie.publicKey.slice(0, 12).toUpperCase())?.name).toBe('Julie');
    expect(client.contacts.get(julie.publicKey.slice(0, 10))).toBeUndefined();
    expect(client.contacts.get('not-hex-at-all')).toBeUndefined();
  });

  it('returns undefined for ambiguous prefixes', async () => {
    const twin = { ...marc, publicKey: `${julie.publicKey.slice(0, 12)}${'0'.repeat(52)}` };
    const { client } = await setupClient({ contacts: [julie, twin] });
    expect(client.contacts.get(julie.publicKey.slice(0, 12))).toBeUndefined();
  });

  it('exposes contact details', async () => {
    const { client } = await setupClient({ contacts: [julie, marc] });
    const contact = client.contacts.cache.get(julie.publicKey)!;
    expect(contact.shortKey).toBe(julie.publicKey.slice(0, 12));
    expect(contact.type).toBe('chat');
    expect(client.contacts.cache.get(marc.publicKey)?.type).toBe('repeater');
    expect(contact.location).toEqual({ latitude: 45.76, longitude: 4.83 });
    expect(client.contacts.cache.get(marc.publicKey)?.location).toBeNull();
    expect(contact.path).toBeNull();
    expect(contact.lastAdvert).toEqual(new Date(1_760_000_000_000));
    expect(String(contact)).toBe('Julie');
  });

  it('emits contactAdd and advert when a heard node is auto-added', async () => {
    const { client, radio } = await setupClient();
    const added = vi.fn();
    const adverts: Advert[] = [];
    client.on('contactAdd', added);
    client.on('advert', (advert) => adverts.push(advert));
    radio.hearAdvert(julie);
    await flush();
    expect(added).toHaveBeenCalledWith(client.contacts.cache.get(julie.publicKey));
    expect(adverts).toMatchObject([{ name: 'Julie', contact: { name: 'Julie' } }]);
  });

  it('emits contactUpdate with a snapshot of the old contact', async () => {
    const { client, radio } = await setupClient({ contacts: [julie] });
    const updates: Array<[string, string]> = [];
    client.on('contactUpdate', (old, current) => updates.push([old.name, current.name]));
    vi.setSystemTime(new Date('2026-09-17T13:00:00Z'));
    radio.hearAdvert({ ...julie, name: 'Julie L.' });
    await flush();
    expect(updates).toEqual([['Julie', 'Julie L.']]);
  });

  it('emits advert without contact for nodes the radio did not store', async () => {
    const { client, radio } = await setupClient({ self: { manualAddContacts: true } });
    const adverts: Advert[] = [];
    client.on('advert', (advert) => adverts.push(advert));
    radio.hearAdvert(marc);
    await flush();
    expect(adverts).toMatchObject([{ name: 'Marc', contact: null, publicKey: marc.publicKey }]);
    expect(client.contacts.cache.size).toBe(0);
  });

  it('emits contactsFull', async () => {
    const { client, radio } = await setupClient({ device: { maxContacts: 1 }, contacts: [julie] });
    const full = vi.fn();
    client.on('contactsFull', full);
    radio.hearAdvert(marc);
    await flush();
    expect(full).toHaveBeenCalledOnce();
  });

  it('follows path updates and firmware deletions', async () => {
    const { client, radio } = await setupClient({ contacts: [julie] });
    const removed = vi.fn();
    client.on('contactRemove', removed);
    vi.setSystemTime(new Date('2026-09-17T13:00:00Z'));
    radio.updatePath(julie.publicKey, { hashSize: 1, hops: [Uint8Array.of(0xa1)] });
    await flush();
    expect(client.contacts.cache.get(julie.publicKey)?.path?.hops).toEqual([Uint8Array.of(0xa1)]);

    radio.deleteContact(julie.publicKey);
    await flush();
    expect(removed).toHaveBeenCalledOnce();
    expect(client.contacts.cache.size).toBe(0);
  });

  it('removes contacts and resets paths through the radio', async () => {
    const routed = { ...julie, outPath: { hashSize: 1 as const, hops: [Uint8Array.of(1)] } };
    const { client, radio } = await setupClient({ contacts: [routed, marc] });
    const contact = client.contacts.cache.get(julie.publicKey)!;
    await client.contacts.resetPath(contact);
    expect(radio.contacts.get(julie.publicKey)?.outPath).toBeNull();
    expect(contact.path).toBeNull();

    await client.contacts.remove(marc.publicKey);
    expect(radio.contacts.has(marc.publicKey)).toBe(false);
    expect(client.contacts.cache.has(marc.publicKey)).toBe(false);
  });

  it('fetch reconciles the cache and reports differences', async () => {
    const { client, radio } = await setupClient({ contacts: [julie] });
    const events: string[] = [];
    client.on('contactAdd', (c) => events.push(`add ${c.name}`));
    client.on('contactRemove', (c) => events.push(`remove ${c.name}`));
    radio.contacts.delete(julie.publicKey);
    radio.contacts.set(marc.publicKey, marc);
    await client.contacts.fetch();
    expect(events).toEqual(['add Marc', 'remove Julie']);
  });
});
