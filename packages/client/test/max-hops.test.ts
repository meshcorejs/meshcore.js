import { fakeContactRecord, MockTransport } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '../src/client/client.js';
import { CommandBuilder } from '../src/commands/command-builder.js';
import type { DenyReason } from '../src/commands/context.js';
import { TooFarError } from '../src/errors.js';
import { EventBuilder } from '../src/events/event-builder.js';
import { silentLogger } from '../src/logger.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-22T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const julie = fakeContactRecord({ name: 'Julie' });
const lyon = { index: 1, name: '#lyon', secret: new Uint8Array(16) };
const ping = new CommandBuilder().setName('ping').setHandler((ctx) => ctx.reply('pong'));

async function setup(maxHops?: number) {
  const context = await setupClient({
    self: { name: 'TrainBot' },
    contacts: [julie],
    channels: [lyon],
    login: false,
    ...(maxHops !== undefined ? { maxHops } : {}),
  });
  const denied: DenyReason[] = [];
  context.client.on('commandDenied', (_ctx, reason) => denied.push(reason));
  let seen = 0;
  const next = async () => {
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    const texts = context.radio.sent.slice(seen).map((m) => m.text);
    seen = context.radio.sent.length;
    return texts;
  };
  return { ...context, denied, next };
}

describe('maxHops', () => {
  it('validates the option', () => {
    const transport = new MockTransport();
    expect(() => new Client({ transport, logger: silentLogger, maxHops: -1 })).toThrow(RangeError);
    expect(() => new Client({ transport, logger: silentLogger, maxHops: 1.5 })).toThrow(RangeError);
    expect(new Client({ transport, logger: silentLogger }).maxHops).toBeNull();
    expect(new Client({ transport, logger: silentLogger, maxHops: 0 }).maxHops).toBe(0);
  });

  it('ignores commands from beyond maxHops, silently, in DM and on channels', async () => {
    const { client, radio, denied, next } = await setup(2);
    client.register(ping);
    await client.login();
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot ping', hops: 3 });
    radio.receiveContactMessage({ from: julie.publicKey, text: '/ping', hops: 3 });
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot ping', hops: 2 });
    radio.receiveContactMessage({ from: julie.publicKey, text: '/ping' });
    expect(await next()).toEqual(['@[Léa] pong', 'pong']);
    expect(denied).toEqual([
      { type: 'tooFar', hopCount: 3 },
      { type: 'tooFar', hopCount: 3 },
    ]);
  });

  it('lets an unknown route through', async () => {
    const { client, radio, next } = await setup(0);
    client.register(ping);
    await client.login();
    radio.receiveContactMessage({ from: julie.publicKey, text: '/ping', hops: 0xff });
    expect(await next()).toEqual(['pong']);
  });

  it('refuses message.reply() from an event but still delivers the message', async () => {
    const { client, radio, next } = await setup(1);
    const seen: Array<[number | null, boolean]> = [];
    const errors: unknown[] = [];
    client.register(
      new EventBuilder().setEvent('messageCreate').setHandler(async (_client, message) => {
        seen.push([message.hopCount, message.tooFar]);
        await message.reply('echo').catch((e) => errors.push(e));
      }),
    );
    await client.login();
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: 'hi', hops: 4 });
    expect(await next()).toEqual([]);
    expect(seen).toEqual([[4, true]]);
    expect(errors[0]).toBeInstanceOf(TooFarError);
    expect(errors[0]).toMatchObject({ code: 'TOO_FAR', hopCount: 4, maxHops: 1 });
  });

  it('does not limit anything when unset', async () => {
    const { client, radio, next } = await setup();
    client.register(ping);
    await client.login();
    radio.receiveContactMessage({ from: julie.publicKey, text: '/ping', hops: 40 });
    expect(await next()).toEqual(['pong']);
  });
});
