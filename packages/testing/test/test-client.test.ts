import { frenchReplies, RadioConfig } from '@meshcorejs/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestClient, fakeContactKey, parseDuration, type TestBot } from '../src/index.js';

const bots: TestBot[] = [];

async function bot(options: Parameters<typeof createTestClient>[0] = {}) {
  const created = await createTestClient({
    load: new URL('./fixtures/bot/', import.meta.url),
    self: { name: 'TrainBot' },
    now: '2026-09-21T06:00:00+02:00',
    ...options,
  });
  bots.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.destroy()));
});

describe('parseDuration', () => {
  it('parses units', () => {
    expect(parseDuration('250ms')).toBe(250);
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('5m')).toBe(300_000);
    expect(parseDuration('1d')).toBe(86_400_000);
    expect(parseDuration(42)).toBe(42);
    expect(() => parseDuration('soon')).toThrow(RangeError);
  });
});

describe('createTestClient', () => {
  it('returns replies to a DM, waiting for slow handlers', async () => {
    const b = await bot();
    const julie = b.fakeContact('Julie');
    expect(await b.dm(julie, '/slow')).toEqual(['done']);
    expect(await b.dm('Julie', 'pas une commande')).toEqual([]);
  });

  it('returns channel replies and creates the channel on demand', async () => {
    const b = await bot();
    expect(await b.channel('#lyon', 'Léa', '@TrainBot')).toEqual(['@[Léa] @TrainBot slow']);
    expect(b.client.channels.get('#lyon')).toBeDefined();
  });

  it('overrides role members', async () => {
    const b = await bot();
    const julie = b.fakeContact('Julie');
    expect(await b.dm(julie, '/secret')).toEqual(['⛔ Permission denied']);
    b.setRoleMembers('admin', [julie]);
    expect(await b.dm(julie, '/secret')).toEqual(['🔓']);
    expect(fakeContactKey('Julie')).toBe(julie.publicKey);
  });

  it('simulates time for jobs and records what was sent where', async () => {
    const b = await bot();
    b.fakeChannel('#lyon');
    await b.advanceTime('50m');
    expect(b.sentTo('#lyon')).toEqual([]);
    await b.advanceTime('15m');
    expect(b.sentTo('#lyon')).toEqual(['☀️ bonjour']);

    await b.setTime('2026-09-25T06:59:00+02:00');
    await b.advanceTime('1m');
    expect(b.sentTo('#lyon')).toEqual(['☀️ bonjour', '☀️ bonjour']);

    const julie = b.fakeContact('Julie');
    await b.dm(julie, '/slow');
    expect(b.sentTo('Julie')).toEqual(['done']);
  });

  it('restores real timers on destroy', async () => {
    const b = await createTestClient({ now: '2000-01-01T00:00:00Z' });
    expect(new Date().getUTCFullYear()).toBe(2000);
    await b.destroy();
    expect(new Date().getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('applies a RadioConfig at login', async () => {
    const b = await bot({
      self: { name: 'MeshCore-1234' },
      radio: new RadioConfig({ name: 'ClubBot', txPower: 14 }),
    });
    expect(b.radio.self.name).toBe('ClubBot');
    expect(b.radio.self.txPowerDbm).toBe(14);
    expect(b.client.self.name).toBe('ClubBot');
  });

  it('forwards replies to the client', async () => {
    const b = await bot({ replies: frenchReplies });
    expect(await b.dm(b.fakeContact('Léa'), '/secret')).toEqual(['⛔ Permission refusée']);
  });
});
