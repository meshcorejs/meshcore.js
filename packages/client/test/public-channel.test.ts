import { PUBLIC_CHANNEL_SECRET } from '@meshcorejs/protocol';
import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBuilder } from '../src/commands/command-builder.js';
import type { DenyReason } from '../src/commands/context.js';
import { PublicChannelError } from '../src/errors.js';
import { EventBuilder } from '../src/events/event-builder.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-22T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const julie = fakeContactRecord({ name: 'Julie' });
export const publicChannel = { index: 0, name: 'Public', secret: PUBLIC_CHANNEL_SECRET };
export const lyon = { index: 1, name: '#lyon', secret: new Uint8Array(16) };

export async function setup() {
  const context = await setupClient({
    self: { name: 'TrainBot' },
    contacts: [julie],
    channels: [publicChannel, lyon],
    login: false,
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
  const onPublic = (text: string) => context.radio.receiveChannelMessage({ channelIndex: 0, senderName: 'Léa', text });
  const onLyon = (text: string) => context.radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text });
  return { ...context, denied, next, onPublic, onLyon, julie };
}

const ping = new CommandBuilder().setName('ping').setHandler((ctx) => ctx.reply('pong'));
const info = new CommandBuilder()
  .setName('info')
  .setScope('public')
  .setHandler((ctx) => ctx.reply('TrainBot, ask me in DM'));
const everywhere = new CommandBuilder()
  .setName('everywhere')
  .setScope('dm', 'channel', 'public')
  .setHandler((ctx) => ctx.reply('here'));

describe("scope 'public'", () => {
  it('ignores a default command on Public but runs it on another channel', async () => {
    const { client, denied, next, onPublic, onLyon } = await setup();
    client.register(ping);
    await client.login();
    onPublic('@TrainBot ping');
    expect(await next()).toEqual([]);
    expect(denied).toEqual([{ type: 'scope' }]);
    onLyon('@TrainBot ping');
    expect(await next()).toEqual(['@[Léa] pong']);
  });

  it("runs a setScope('public') command only on Public", async () => {
    const { client, denied, next, onPublic, onLyon, radio } = await setup();
    client.register(info);
    await client.login();
    onPublic('@TrainBot info');
    expect(await next()).toEqual(['@[Léa] TrainBot, ask me in DM']);
    onLyon('@TrainBot info');
    expect(await next()).toEqual([]);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/info' });
    expect(await next()).toEqual([]);
    expect(denied).toEqual([{ type: 'scope' }, { type: 'scope' }]);
  });

  it("answers everywhere with setScope('dm', 'channel', 'public')", async () => {
    const { client, next, onPublic, onLyon, radio } = await setup();
    client.register(everywhere);
    await client.login();
    onPublic('@TrainBot everywhere');
    onLyon('@TrainBot everywhere');
    radio.receiveContactMessage({ from: julie.publicKey, text: '/everywhere' });
    expect((await next()).sort()).toEqual(['@[Léa] here', '@[Léa] here', 'here']);
  });

  it("lists only 'public' commands in the helper on Public", async () => {
    const { client, next, onPublic } = await setup();
    client.register([ping, info, everywhere]);
    await client.login();
    onPublic('@TrainBot');
    const [line] = await next();
    expect(line).toContain('info');
    expect(line).toContain('everywhere');
    expect(line).not.toContain('ping');
  });
});

describe('the only door to Public is ctx.reply()', () => {
  it('refuses channel.send() on Public, from anywhere', async () => {
    const { client, next } = await setup();
    await client.login();
    const pub = client.channels.get(0)!;
    await expect(pub.send('hello world')).rejects.toBeInstanceOf(PublicChannelError);
    await expect(pub.send('hello world')).rejects.toMatchObject({ code: 'PUBLIC_CHANNEL' });
    await expect(client.channels.get(1)!.send('hello lyon')).resolves.toBeDefined();
    expect(await next()).toEqual(['hello lyon']);
  });

  it('refuses message.reply() from an event on Public, allows it elsewhere', async () => {
    const { client, next, onPublic, onLyon } = await setup();
    const errors: unknown[] = [];
    client.register(
      new EventBuilder()
        .setEvent('messageCreate')
        .setHandler((_client, message) => message.reply(`echo ${message.content}`).catch((e) => errors.push(e))),
    );
    await client.login();
    onPublic('hi');
    onLyon('hi');
    expect(await next()).toEqual(['@[Léa] echo hi']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(PublicChannelError);
  });

  it("lets ctx.reply() through for a 'public' command (see scope tests) and stays silent for the helper when no command is public", async () => {
    const { client, next, onPublic } = await setup();
    client.register(ping);
    await client.login();
    onPublic('@TrainBot');
    expect(await next()).toEqual([]);
  });
});
