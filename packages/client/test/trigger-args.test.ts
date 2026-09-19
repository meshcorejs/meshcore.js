import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArgBuilder } from '../src/commands/args.js';
import { ArgumentError, parseArgs } from '../src/commands/parse-args.js';
import { tokenize } from '../src/commands/tokenize.js';
import { parseTrigger } from '../src/commands/trigger.js';
import { setupClient } from './helpers.js';

describe('parseTrigger', () => {
  it('DM: "/" followed by the command name', () => {
    expect(parseTrigger('/train 6607', true, 'TrainBot')).toEqual({ type: 'command', name: 'train', argsText: '6607' });
    expect(parseTrigger('  /TRAIN   6607  ', true, 'TrainBot')).toEqual({
      type: 'command',
      name: 'train',
      argsText: '6607',
    });
    expect(parseTrigger('/', true, 'TrainBot')).toEqual({ type: 'helper' });
    expect(parseTrigger('/help', true, 'TrainBot')).toEqual({ type: 'helper' });
    expect(parseTrigger('/help train', true, 'TrainBot')).toEqual({ type: 'helper' });
  });

  it('DM: the channel form "@Bot name" is accepted too', () => {
    expect(parseTrigger('@TrainBot train 6607', true, 'TrainBot')).toEqual({
      type: 'command',
      name: 'train',
      argsText: '6607',
    });
    expect(parseTrigger('@[TrainBot]', true, 'TrainBot')).toEqual({ type: 'helper' });
    expect(parseTrigger('@TrainBot /train 6607', true, 'TrainBot')).toBeNull(); // no "/" after a mention
  });

  it('DM: everything else is not a command', () => {
    expect(parseTrigger('train 6607', true, 'TrainBot')).toBeNull();
    expect(parseTrigger('/ train', true, 'TrainBot')).toBeNull();
    expect(parseTrigger('@OtherBot train', true, 'TrainBot')).toBeNull();
  });

  it('channel: mention of the bot then the name, without "/"', () => {
    expect(parseTrigger('@TrainBot departs lyon', false, 'TrainBot')).toEqual({
      type: 'command',
      name: 'departs',
      argsText: 'lyon',
    });
    expect(parseTrigger('@[trainbot] departs lyon', false, 'TrainBot')).toMatchObject({ name: 'departs' });
    expect(parseTrigger('@[Mesh Bot] ping', false, 'Mesh Bot')).toMatchObject({ name: 'ping' });
    expect(parseTrigger('@TrainBot', false, 'TrainBot')).toEqual({ type: 'helper' });
    expect(parseTrigger('@TrainBot ?', false, 'TrainBot')).toEqual({ type: 'helper' });
    expect(parseTrigger('@TrainBot help', false, 'TrainBot')).toEqual({ type: 'helper' });
  });

  it('channel: everything else is not a command', () => {
    expect(parseTrigger('/departs lyon', false, 'TrainBot')).toBeNull();
    expect(parseTrigger('@TrainBot /departs lyon', false, 'TrainBot')).toBeNull();
    expect(parseTrigger('departs lyon', false, 'TrainBot')).toBeNull();
    expect(parseTrigger('@TrainBotX departs', false, 'TrainBot')).toBeNull();
    expect(parseTrigger('@OtherBot departs', false, 'TrainBot')).toBeNull();
  });
});

describe('tokenize', () => {
  it('splits on whitespace and groups quoted text', () => {
    expect(tokenize('departs "lyon part dieu"  3').map((t) => t.value)).toEqual(['departs', 'lyon part dieu', '3']);
    expect(tokenize('"unclosed quote here').map((t) => t.value)).toEqual(['unclosed quote here']);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('parseArgs', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const arg = (builder: { build(): { definition: import('../src/commands/args.js').ArgDefinition } }) =>
    builder.build().definition;

  it('parses every scalar type', async () => {
    const { client } = await setupClient();
    const defs = [
      arg(new ArgBuilder('string').setName('s').setRequired()),
      arg(new ArgBuilder('integer').setName('i').setRequired()),
      arg(new ArgBuilder('number').setName('n').setRequired()),
      arg(new ArgBuilder('boolean').setName('b').setRequired()),
      arg(new ArgBuilder('choice').setName('c').setChoices('matin', 'soir').setRequired()),
    ];
    expect(parseArgs(client, defs, 'abc -3 12,5 oui SOIR')).toEqual({ s: 'abc', i: -3, n: 12.5, b: true, c: 'soir' });
  });

  it('applies defaults and leaves missing optional arguments undefined', async () => {
    const { client } = await setupClient();
    const defs = [
      arg(new ArgBuilder('integer').setName('nombre').setDefault(3)),
      arg(new ArgBuilder('string').setName('x')),
    ];
    expect(parseArgs(client, defs, '')).toEqual({ nombre: 3, x: undefined });
  });

  it('takes the rest of the line for setRest', async () => {
    const { client } = await setupClient();
    const defs = [
      arg(new ArgBuilder('integer').setName('n').setRequired()),
      arg(new ArgBuilder('string').setName('gare').setRequired().setRest()),
    ];
    expect(parseArgs(client, defs, '3 lyon  part dieu')).toEqual({ n: 3, gare: 'lyon  part dieu' });
    expect(parseArgs(client, defs, '3 "lyon part dieu"')).toEqual({ n: 3, gare: 'lyon part dieu' });
  });

  it('validates constraints', async () => {
    const { client } = await setupClient();
    const check = (builder: Parameters<typeof arg>[0], input: string) => {
      try {
        parseArgs(client, [arg(builder)], input);
        return 'ok';
      } catch (error) {
        return error instanceof ArgumentError ? error.reason : 'other';
      }
    };
    expect(check(new ArgBuilder('string').setName('n').setPattern(/^\d{3,6}$/), 'abc')).toBe('invalid');
    expect(check(new ArgBuilder('string').setName('n').setMaxLength(3), 'abcd')).toBe('invalid');
    expect(check(new ArgBuilder('integer').setName('n').setMax(5), '6')).toBe('invalid');
    expect(check(new ArgBuilder('integer').setName('n'), '1.5')).toBe('invalid');
    expect(check(new ArgBuilder('boolean').setName('n'), 'peut-être')).toBe('invalid');
    expect(check(new ArgBuilder('string').setName('n').setRequired(), '')).toBe('missing');
    expect(check(new ArgBuilder('string').setName('n'), 'a b')).toBe('tooMany');
  });

  it('resolves contacts by name, name prefix or key prefix', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const julien = fakeContactRecord({ name: 'Julien' });
    const marc = fakeContactRecord({ name: 'Marc' });
    const { client } = await setupClient({ contacts: [julie, julien, marc] });
    const defs = [arg(new ArgBuilder('contact').setName('c').setRequired())];
    expect((parseArgs(client, defs, 'julie').c as { name: string }).name).toBe('Julie');
    expect((parseArgs(client, defs, 'Ma').c as { name: string }).name).toBe('Marc');
    expect((parseArgs(client, defs, marc.publicKey.slice(0, 12)).c as { name: string }).name).toBe('Marc');
    expect(() => parseArgs(client, defs, 'Jul')).toThrow(expect.objectContaining({ reason: 'ambiguous' }));
    expect(() => parseArgs(client, defs, 'Zoé')).toThrow(expect.objectContaining({ reason: 'invalid' }));
  });

  it('resolves channels by name or index', async () => {
    const { client } = await setupClient({ channels: [{ index: 2, name: '#lyon', secret: new Uint8Array(16) }] });
    const defs = [arg(new ArgBuilder('channel').setName('c').setRequired())];
    expect((parseArgs(client, defs, '#lyon').c as { index: number }).index).toBe(2);
    expect((parseArgs(client, defs, '2').c as { index: number }).index).toBe(2);
    expect(() => parseArgs(client, defs, '#paris')).toThrow(ArgumentError);
  });
});
