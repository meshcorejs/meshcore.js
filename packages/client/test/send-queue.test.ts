import { CommandCode } from '@meshcorejs/protocol';
import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageBuilder } from '../src/builders/message-builder.js';
import { DeliveryFailedError, MessageTooLongError, RateLimitError } from '../src/errors.js';
import { CHANNEL_SEND_LIMIT, CHANNEL_SEND_WINDOW_MS } from '../src/messages/send-queue.js';
import type { SentMessage } from '../src/messages/sent-message.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const julie = fakeContactRecord({ name: 'Julie' });
const lyon = { index: 1, name: '#lyon', secret: new Uint8Array(16) };

async function setup(options: Parameters<typeof setupClient>[0] = {}) {
  const context = await setupClient({ self: { name: 'TrainBot' }, contacts: [julie], channels: [lyon], ...options });
  const contact = context.client.contacts.cache.get(julie.publicKey)!;
  const channel = context.client.channels.get('#lyon')!;
  return { ...context, contact, channel };
}

describe('direct messages', () => {
  it('resolves when sent and becomes delivered on ACK', async () => {
    const { client, radio, contact } = await setup();
    const delivered = vi.fn();
    client.on('messageDelivered', delivered);

    const sent = await contact.send('pong 🏓');
    expect(sent.status).toBe('sent');
    expect(sent.isDM).toBe(true);
    expect(radio.sent).toMatchObject([{ kind: 'dm', text: 'pong 🏓', attempt: 0 }]);

    await vi.advanceTimersByTimeAsync(50);
    expect(sent.status).toBe('delivered');
    await expect(sent.delivered()).resolves.toBeUndefined();
    expect(delivered).toHaveBeenCalledWith(sent);
  });

  it('rejects strings over 158 bytes', async () => {
    const { contact } = await setup();
    await expect(contact.send('x'.repeat(158))).resolves.toBeDefined();
    await expect(contact.send('x'.repeat(159))).rejects.toBeInstanceOf(MessageTooLongError);
    await expect(contact.send('')).rejects.toBeInstanceOf(RangeError);
  });

  it('resends up to 3 times with increasing attempt, then fails', async () => {
    const { client, radio, contact } = await setup({ suggestedTimeoutMs: 1000 });
    radio.ackMode = 'never';
    radio.contacts.get(julie.publicKey)!.outPath = null;
    const failed = vi.fn();
    client.on('messageFailed', failed);

    const sent = await contact.send('allo ?');
    const delivered = sent.delivered();
    const assertion = expect(delivered).rejects.toMatchObject({ constructor: DeliveryFailedError, reason: 'noAck' });
    await vi.advanceTimersByTimeAsync(4 * 3000);
    await assertion;
    expect(radio.sent.map((m) => (m.kind === 'dm' ? m.attempt : -1))).toEqual([0, 1, 2, 3]);
    expect(sent.status).toBe('failed');
    expect(failed).toHaveBeenCalledWith(sent, sent.error);
  });

  it('resets a direct path and floods once more before failing', async () => {
    const routed = { ...julie, outPath: { hashSize: 1 as const, hops: [Uint8Array.of(0xa1)] } };
    const { radio, contact } = await setup({ contacts: [routed], suggestedTimeoutMs: 1000 });
    radio.ackMode = 'never';

    const sent = await contact.send('allo ?');
    const assertion = expect(sent.delivered()).rejects.toBeInstanceOf(DeliveryFailedError);
    await vi.advanceTimersByTimeAsync(5 * 3000);
    await assertion;
    expect(radio.sent.map((m) => (m.kind === 'dm' ? [m.attempt, m.flood] : null))).toEqual([
      [0, false],
      [1, false],
      [2, false],
      [3, false],
      [4, true],
    ]);
    expect(radio.commands).toContain(CommandCode.ResetPath);
  });

  it('accepts a late ACK of an earlier attempt', async () => {
    const { radio, contact } = await setup({ suggestedTimeoutMs: 1000 });
    radio.ackMode = 'manual';
    const sent = await contact.send('allo ?');
    await vi.advanceTimersByTimeAsync(1000);
    const first = radio.sent[0];
    if (first?.kind !== 'dm') throw new Error('expected a DM');
    radio.ack(first.expectedAck);
    await flush();
    expect(sent.status).toBe('delivered');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(radio.sent).toHaveLength(1);
  });

  it('fails immediately when the radio refuses the message', async () => {
    const { radio, contact } = await setup();
    radio.contacts.delete(julie.publicKey);
    await expect(contact.send('hello')).rejects.toMatchObject({ reason: 'radio' });
  });
});

describe('channel messages', () => {
  it('stays sent (no ACK) and resolves delivered() right away', async () => {
    const { radio, channel } = await setup();
    const sent = await channel.send('bonjour #lyon');
    expect(sent.status).toBe('sent');
    await expect(sent.delivered()).resolves.toBeUndefined();
    expect(radio.sent).toMatchObject([{ kind: 'channel', channelIndex: 1, wireText: 'TrainBot: bonjour #lyon' }]);
  });

  it('uses 160 bytes minus "<bot name>: " as budget', async () => {
    const { channel } = await setup();
    await expect(channel.send('x'.repeat(150))).resolves.toBeDefined();
    await expect(channel.send('x'.repeat(151))).rejects.toMatchObject({ limit: 150 });
  });
});

describe('pacing and splitting', () => {
  it('spaces transmissions by 2 s and keeps split parts in order', async () => {
    const { radio, channel, contact } = await setup();
    const builder = new MessageBuilder()
      .addLines(Array.from({ length: 8 }, (_, i) => `ligne ${i} ${'.'.repeat(20)}`))
      .setOverflow('split');

    const first = channel.send(builder);
    const second = contact.send('après');
    await flush();
    expect(radio.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(radio.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(radio.sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);

    const parts = (await first).parts;
    expect(parts).toHaveLength(2);
    expect(radio.sent.map((m) => m.text)).toEqual([...parts, 'après']);
    await expect(second).resolves.toBeDefined();
  });
});

describe('replies', () => {
  it('replies to a DM with a DM', async () => {
    const { client, radio } = await setup();
    const replies: Promise<SentMessage>[] = [];
    client.on('messageCreate', (message) => replies.push(message.reply('pong')));
    radio.receiveContactMessage({ from: julie.publicKey, text: 'salut' });
    await flush();
    await Promise.all(replies);
    expect(radio.sent).toMatchObject([{ kind: 'dm', text: 'pong' }]);
  });

  it('mentions the author when replying on a channel, unless disabled', async () => {
    const { client, radio } = await setup();
    const replies: Promise<SentMessage>[] = [];
    client.on('messageCreate', (message) => {
      replies.push(message.reply('pong'), message.reply('sans mention', { mention: false }));
    });
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: 'bonjour' });
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all(replies);
    expect(radio.sent.map((m) => m.text)).toEqual(['@[Léa] pong', 'sans mention']);
  });
});

describe('channel rate limit', () => {
  it('accepts 10 parts per channel per 5 minutes, then refuses without queueing', async () => {
    const { client, radio, channel } = await setup();
    const failed = vi.fn();
    client.on('messageFailed', failed);
    for (let i = 0; i < CHANNEL_SEND_LIMIT; i++) {
      const sending = channel.send(`msg ${i}`);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(sending).resolves.toBeDefined();
    }
    const refused = channel.send('one too many');
    await expect(refused).rejects.toBeInstanceOf(RateLimitError);
    await expect(refused).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      resource: 'channel',
      channel,
      limit: CHANNEL_SEND_LIMIT,
      windowMs: CHANNEL_SEND_WINDOW_MS,
    });
    expect(radio.sent).toHaveLength(CHANNEL_SEND_LIMIT);
    expect(failed).not.toHaveBeenCalled();
  });

  it('reports when the next part frees up and accepts again after the window', async () => {
    const { channel } = await setup();
    for (let i = 0; i < CHANNEL_SEND_LIMIT; i++) {
      const sending = channel.send(`msg ${i}`);
      await vi.advanceTimersByTimeAsync(2000);
      await sending;
    }
    await expect(channel.send('x')).rejects.toMatchObject({ retryAfterMs: CHANNEL_SEND_WINDOW_MS - 20_000 });
    await vi.advanceTimersByTimeAsync(CHANNEL_SEND_WINDOW_MS - 20_000);
    const sending = channel.send('again');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(sending).resolves.toBeDefined();
  });

  it('counts parts and refuses a split message that does not fit whole', async () => {
    const { channel } = await setup();
    for (let i = 0; i < CHANNEL_SEND_LIMIT - 2; i++) {
      const sending = channel.send(`msg ${i}`);
      await vi.advanceTimersByTimeAsync(2000);
      await sending;
    }
    const three = new MessageBuilder()
      .addLines(Array.from({ length: 40 }, (_, i) => `ligne ${i} un peu longue pour forcer`))
      .setOverflow('split', { maxParts: 3 });
    await expect(channel.send(three)).rejects.toBeInstanceOf(RateLimitError);
    const sending = channel.send('fits');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(sending).resolves.toBeDefined();
  });

  it('keeps one budget per channel and none for DMs', async () => {
    const { client, radio, channel, contact } = await setup({
      channels: [lyon, { index: 2, name: '#paris', secret: new Uint8Array(16) }],
    });
    for (let i = 0; i < CHANNEL_SEND_LIMIT; i++) {
      const sending = channel.send(`msg ${i}`);
      await vi.advanceTimersByTimeAsync(2000);
      await sending;
    }
    const paris = client.channels.get('#paris')!;
    const onParis = paris.send('hello');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(onParis).resolves.toBeDefined();
    for (let i = 0; i < 12; i++) {
      const sending = contact.send(`dm ${i}`);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(sending).resolves.toBeDefined();
    }
    expect(radio.sent.filter((m) => m.kind === 'dm')).toHaveLength(12);
  });
});

describe('outages and shutdown', () => {
  it('holds messages while disconnected and sends them after reconnecting', async () => {
    const { radio, transport, contact } = await setup();
    transport.simulateDisconnect();
    const pending = contact.send('en attente');
    await vi.advanceTimersByTimeAsync(500);
    expect(radio.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeDefined();
    expect(radio.sent).toMatchObject([{ text: 'en attente' }]);
  });

  it('drops messages that waited more than 5 minutes', async () => {
    const { transport, contact } = await setup();
    const connect = vi.spyOn(transport, 'connect').mockRejectedValue(new Error('down'));
    transport.simulateDisconnect();
    const pending = contact.send('trop tard');
    const assertion = expect(pending).rejects.toMatchObject({ reason: 'expired' });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    connect.mockRestore();
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it('destroy flushes the queue before closing', async () => {
    const { client, radio, contact } = await setup();
    const a = contact.send('un');
    const b = contact.send('deux');
    await flush();
    const destroyed = client.destroy();
    await vi.advanceTimersByTimeAsync(2000);
    await destroyed;
    await expect(a).resolves.toBeDefined();
    await expect(b).resolves.toBeDefined();
    expect(radio.sent.map((m) => m.text)).toEqual(['un', 'deux']);
  });
});
