import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../src/structures/message.js';
import { parseChannelText } from '../src/structures/message.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

function collect(client: Awaited<ReturnType<typeof setupClient>>['client']): Message[] {
  const messages: Message[] = [];
  client.on('messageCreate', (message) => messages.push(message));
  return messages;
}

describe('incoming messages', () => {
  it('turns a DM into a Message authored by the Contact', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { client, radio } = await setupClient({ contacts: [julie] });
    const messages = collect(client);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6607', snr: -3.5, hops: 2 });
    await flush();

    expect(messages).toHaveLength(1);
    const [message] = messages;
    expect(message?.content).toBe('/train 6607');
    expect(message?.isDM).toBe(true);
    expect(message?.channel).toBeNull();
    expect(message?.author).toBe(client.contacts.cache.get(julie.publicKey));
    expect(message?.author.verified).toBe(true);
    expect(message?.snr).toBe(-3.5);
    expect(message?.hopCount).toBe(2);
    expect(message?.backlog).toBe(false);
    expect(message?.createdAt).toEqual(new Date('2026-09-17T12:00:00Z'));
  });

  it('turns a channel message into a Message with an unverified author', async () => {
    const { client, radio } = await setupClient({
      channels: [{ index: 1, name: '#lyon', secret: new Uint8Array(16) }],
    });
    const messages = collect(client);
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot departs lyon' });
    await flush();

    const [message] = messages;
    expect(message?.content).toBe('@TrainBot departs lyon');
    expect(message?.author).toEqual({ name: 'Léa', verified: false });
    expect(message?.channel?.name).toBe('#lyon');
    expect(message?.isDM).toBe(false);
  });

  it('refreshes contacts when a DM comes from a contact missing in the cache', async () => {
    const { client, radio } = await setupClient();
    const julie = fakeContactRecord({ name: 'Julie' });
    radio.contacts.set(julie.publicKey, julie);
    const messages = collect(client);
    radio.receiveContactMessage({ from: julie.publicKey, text: 'coucou' });
    await flush();
    expect(messages[0]?.author.name).toBe('Julie');
  });

  it('drains every queued message after a single MSG_WAITING burst', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { client, radio } = await setupClient({ contacts: [julie] });
    const messages = collect(client);
    for (const text of ['1', '2', '3']) radio.receiveContactMessage({ from: julie.publicKey, text });
    await flush();
    expect(messages.map((m) => m.content)).toEqual(['1', '2', '3']);
    expect(radio.pendingMessages).toBe(0);
  });

  it('reports listener errors instead of breaking the sync loop', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { client, radio } = await setupClient({ contacts: [julie] });
    const onError = vi.fn();
    client.on('error', onError);
    client.on('messageCreate', () => {
      throw new Error('bug in bot');
    });
    const messages = collect(client);
    radio.receiveContactMessage({ from: julie.publicKey, text: 'a' });
    radio.receiveContactMessage({ from: julie.publicKey, text: 'b' });
    await flush();
    expect(onError).toHaveBeenCalledWith(new Error('bug in bot'), { type: 'internal', name: 'messageCreate' });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(messages).toHaveLength(0);
  });
});

describe('parseChannelText', () => {
  it('splits on the first ": "', () => {
    expect(parseChannelText('Léa: salut: ça va')).toEqual({ authorName: 'Léa', content: 'salut: ça va' });
    expect(parseChannelText('no separator')).toEqual({ authorName: '', content: 'no separator' });
  });
});
