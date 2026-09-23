import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBuilder } from '../src/commands/command-builder.js';
import type { DenyReason } from '../src/commands/context.js';
import { frenchReplies } from '../src/commands/replies.js';
import { Permissions } from '../src/permissions/permission-builder.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-22T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const julie = fakeContactRecord({ name: 'Julie' });
const lyon = { index: 1, name: '#lyon', secret: new Uint8Array(16) };

const ping = new CommandBuilder()
  .setName('ping')
  .setCooldown(60)
  .setHandler((ctx) => ctx.reply('pong'));
const train = new CommandBuilder()
  .setName('train')
  .addStringArg((a) => a.setName('numero').setRequired())
  .setHandler((ctx) => ctx.reply(`🚆 ${ctx.args.numero}`));
const admin = new CommandBuilder()
  .setName('admin')
  .setRequiredPermissions(Permissions.Administrator)
  .setHandler((ctx) => ctx.reply('ok'));

async function setup(options: Parameters<typeof setupClient>[0] = {}) {
  const context = await setupClient({
    self: { name: 'TrainBot' },
    contacts: [julie],
    channels: [lyon],
    login: false,
    ...options,
  });
  const denied: DenyReason[] = [];
  context.client.on('commandDenied', (_ctx, reason) => denied.push(reason));
  context.client.register([ping, train, admin]);
  await context.client.login();
  let seen = 0;
  const next = async () => {
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    const texts = context.radio.sent.slice(seen).map((m) => m.text);
    seen = context.radio.sent.length;
    return texts;
  };
  const channel = (text: string) => context.radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text });
  const dm = (text: string) => context.radio.receiveContactMessage({ from: julie.publicKey, text });
  return { ...context, denied, next, channel, dm };
}

describe('on a channel the bot only speaks to answer an executed command', () => {
  it('stays silent on every refusal, but still emits commandDenied', async () => {
    const { denied, next, channel } = await setup();
    channel('@TrainBot nope');
    channel('@TrainBot admin');
    channel('@TrainBot train');
    channel('@TrainBot ping');
    channel('@TrainBot ping');
    expect(await next()).toEqual(['@[Léa] pong']);
    expect(denied.map((d) => d.type)).toEqual(['unknownCommand', 'channelUntrusted', 'invalidArguments', 'cooldown']);
  });

  it('keeps answering refusals in DM', async () => {
    const { next, dm } = await setup();
    dm('/nope');
    dm('/train');
    dm('/ping');
    dm('/ping');
    expect(await next()).toEqual([
      '❓ Unknown command, /help',
      '⚠️ numero is missing\n/train <numero>',
      'pong',
      '⏳ Try again in 60s',
    ]);
  });

  it('answers @Bot on a channel with one line, in DM with the full list', async () => {
    const { next, channel, dm } = await setup();
    channel('@TrainBot');
    expect(await next()).toEqual(['@[Léa] Commands: ping, train · DM me /help']);
    dm('/help');
    expect(await next()).toEqual(['/ping\n/train <numero>']);
  });

  it('translates the channel helper line', async () => {
    const { next, channel } = await setup({ replies: frenchReplies });
    channel('@TrainBot');
    expect(await next()).toEqual(['@[Léa] Commandes : ping, train · /help en DM']);
  });

  it('keeps the channel helper line within the byte budget', async () => {
    const { client, next, channel } = await setup();
    for (let i = 0; i < 30; i++) client.register(new CommandBuilder().setName(`commande${i}`).setHandler(() => {}));
    channel('@TrainBot');
    const [line] = await next();
    expect(line).toMatch(/^@\[Léa\] Commands: ping, train, commande0, .*… · DM me \/help$/);
    expect(new TextEncoder().encode(`TrainBot: ${line}`).length).toBeLessThanOrEqual(160);
  });
});
