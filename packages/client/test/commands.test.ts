import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageBuilder } from '../src/builders/message-builder.js';
import { CommandBuilder } from '../src/commands/command-builder.js';
import type { DenyReason } from '../src/commands/context.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const julie = fakeContactRecord({ name: 'Julie' });
const lyon = { index: 1, name: '#lyon', secret: new Uint8Array(16) };

const train = new CommandBuilder()
  .setName('train')
  .addAliases('t')
  .addStringArg((a) =>
    a
      .setName('numero')
      .setRequired(true)
      .setPattern(/^\d{3,6}$/),
  )
  .setCooldown(20)
  .setHandler(async (ctx) => {
    await ctx.reply(new MessageBuilder().setTitle(`🚆 ${ctx.args.numero}`).addField('Voie', 'H'));
  });

const whoami = new CommandBuilder()
  .setName('whoami')
  .setScope('dm')
  .setHandler((ctx) => ctx.reply(`👤 ${ctx.author.name}`));

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
  return { ...context, denied };
}

/** Runs pending work and returns what the bot sent since the last call. */
function sentTexts(radio: Awaited<ReturnType<typeof setup>>['radio']) {
  let seen = 0;
  return async () => {
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    const texts = radio.sent.slice(seen).map((m) => m.text);
    seen = radio.sent.length;
    return texts;
  };
}

describe('command pipeline', () => {
  it('runs a DM command and emits commandRun', async () => {
    const { client, radio } = await setup();
    client.register([train, whoami]);
    await client.login();
    const run = vi.fn();
    client.on('commandRun', run);
    const next = sentTexts(radio);

    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6607' });
    expect(await next()).toEqual(['🚆 6607\nVoie: H']);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ args: { numero: '6607' } }));

    radio.receiveContactMessage({ from: julie.publicKey, text: '/whoami' });
    expect(await next()).toEqual(['👤 Julie']);
  });

  it('runs a channel command after a mention and replies with a mention', async () => {
    const { client, radio } = await setup();
    client.register(train);
    await client.login();
    const next = sentTexts(radio);
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot t 6611' });
    expect(await next()).toEqual(['@[Léa] 🚆 6611\nVoie: H']);
  });

  it('ignores messages that do not follow the trigger rule', async () => {
    const { client, radio, denied } = await setup();
    client.register(train);
    await client.login();
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: 'train 6607' });
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '/train 6607' });
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: 'train 6607' });
    expect(await next()).toEqual([]);
    expect(denied).toEqual([]);
  });

  it('answers unknown commands', async () => {
    const { client, radio, denied } = await setup();
    await client.login();
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/trian 6607' });
    expect(await next()).toEqual(['❓ Unknown command, /help']);
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot trian' });
    expect(await next()).toEqual(['@[Léa] ❓ Unknown command']);
    expect(denied).toEqual([
      { type: 'unknownCommand', name: 'trian' },
      { type: 'unknownCommand', name: 'trian' },
    ]);
  });

  it('silently refuses a command outside its scope', async () => {
    const { client, radio, denied } = await setup();
    client.register(whoami);
    await client.login();
    const next = sentTexts(radio);
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot whoami' });
    expect(await next()).toEqual([]);
    expect(denied).toEqual([{ type: 'scope' }]);
  });

  it('replies with the usage when arguments are invalid', async () => {
    const { client, radio, denied } = await setup();
    client.register(train);
    await client.login();
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train abc' });
    expect(await next()).toEqual(['⚠️ numero is invalid\n/train <numero>']);
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot train' });
    expect(await next()).toEqual(['@[Léa] ⚠️ numero is missing\n@TrainBot train <numero>']);
    expect(denied.map((d) => d.type)).toEqual(['invalidArguments', 'invalidArguments']);
  });

  it('uses a custom usage error handler', async () => {
    const { client, radio } = await setup();
    client.register(
      new CommandBuilder()
        .setName('echo')
        .addIntegerArg((a) => a.setName('n').setRequired())
        .setUsageErrorHandler((_ctx, error) => `nope: ${error.reason}`)
        .setHandler(() => {}),
    );
    await client.login();
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/echo x' });
    expect(await next()).toEqual(['nope: invalid']);
  });

  it('applies the per-author cooldown', async () => {
    const { client, radio, denied } = await setup();
    client.register(train);
    await client.login();
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6607' });
    await next();
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6611' });
    expect(await next()).toEqual(['⏳ Try again in 10s']);
    expect(denied).toEqual([{ type: 'cooldown', remainingSeconds: 10 }]);
    await vi.advanceTimersByTimeAsync(10_000);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6611' });
    expect(await next()).toEqual(['🚆 6611\nVoie: H']);
  });

  it('ignores backlog commands older than maxAge', async () => {
    const { client, radio, denied } = await setup();
    client.register(train);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6607', senderTimestamp: radio.clock - 600 });
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6611', senderTimestamp: radio.clock - 60 });
    await client.login();
    const next = sentTexts(radio);
    expect(await next()).toEqual(['🚆 6611\nVoie: H']);
    expect(denied).toEqual([{ type: 'backlog', ageSeconds: 600 }]);
  });

  it('reports handler errors and replies with a generic message', async () => {
    const { client, radio } = await setup();
    client.register(
      new CommandBuilder().setName('boom').setHandler(() => {
        throw new Error('database down');
      }),
    );
    await client.login();
    const onError = vi.fn();
    client.on('commandError', onError);
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/boom' });
    expect(await next()).toEqual(['❌ Internal error']);
    expect(onError).toHaveBeenCalledWith(
      new Error('database down'),
      expect.objectContaining({ command: expect.objectContaining({ name: 'boom' }) }),
    );
  });

  it('falls back to the error event when nobody listens to commandError', async () => {
    const { client, radio } = await setup();
    client.register(
      new CommandBuilder()
        .setName('boom')
        .setErrorHandler(() => '💥')
        .setHandler(async () => {
          throw new Error('async failure');
        }),
    );
    await client.login();
    const onError = vi.fn();
    client.on('error', onError);
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/boom' });
    expect(await next()).toEqual(['💥']);
    expect(onError).toHaveBeenCalledWith(new Error('async failure'), { type: 'command', name: 'boom' });
  });

  it('refuses to log in with colliding names and aliases', async () => {
    const { client } = await setup();
    client.register([train, new CommandBuilder().setName('t').setHandler(() => {})]);
    await expect(client.login()).rejects.toThrow('"t" is already used by command "train"');
  });
});

describe('built-in helper', () => {
  it('lists the commands usable in DM', async () => {
    const { client, radio } = await setup();
    client.register([train, whoami]);
    await client.login();
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/' });
    expect(await next()).toEqual(['/train <numero>\n/whoami']);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/help train' });
    expect(await next()).toEqual(['/train <numero>\n/whoami']);
  });

  it('lists the commands usable on a channel, with the mention syntax', async () => {
    const { client, radio } = await setup();
    client.register([train, whoami]);
    await client.login();
    const next = sentTexts(radio);
    radio.receiveChannelMessage({ channelIndex: 1, senderName: 'Léa', text: '@TrainBot' });
    expect(await next()).toEqual(['@[Léa] @TrainBot train <numero>']);
  });

  it('says when nothing is available and splits long lists', async () => {
    const { client, radio } = await setup();
    await client.login();
    const next = sentTexts(radio);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/help' });
    expect(await next()).toEqual(['No commands available']);

    for (let i = 0; i < 18; i++) {
      client.register(
        new CommandBuilder()
          .setName(`commande${i}`)
          .addStringArg((a) => a.setName('argument').setRequired())
          .setHandler(() => {}),
      );
    }
    radio.receiveContactMessage({ from: julie.publicKey, text: '/' });
    const parts = await next();
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^\/commande0 <argument>\n/);
    expect(parts[2]).toMatch(/ 3\/3$/);
  });
});
