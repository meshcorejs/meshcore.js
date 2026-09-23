import { CommandCode } from '@meshcorejs/protocol';
import { FakeRadio, MockTransport } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '../src/client/client.js';
import { CommandTimeoutError, RadioError, RateLimitError } from '../src/errors.js';
import type { Logger } from '../src/logger.js';
import { ADVERT_FLOOD_INTERVAL_MS } from '../src/radio/radio.js';
import { RadioConfig } from '../src/radio/radio-config.js';
import { setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-22T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const adverts = (codes: number[]) => codes.filter((c) => c === CommandCode.SendSelfAdvert).length;

describe('flood advert limit', () => {
  it('allows one flood advert per 30 minutes, zero-hop adverts always', async () => {
    const { client, radio } = await setupClient();
    await client.radio.sendSelfAdvert(true);
    const refused = client.radio.sendSelfAdvert(true);
    await expect(refused).rejects.toBeInstanceOf(RateLimitError);
    await expect(refused).rejects.toMatchObject({
      resource: 'advert',
      channel: null,
      limit: 1,
      windowMs: ADVERT_FLOOD_INTERVAL_MS,
      retryAfterMs: ADVERT_FLOOD_INTERVAL_MS,
    });
    await client.radio.sendSelfAdvert(false);
    await client.radio.sendSelfAdvert(false);
    expect(adverts(radio.commands)).toBe(3);
    await vi.advanceTimersByTimeAsync(ADVERT_FLOOD_INTERVAL_MS);
    await expect(client.radio.sendSelfAdvert(true)).resolves.toBeUndefined();
    expect(adverts(radio.commands)).toBe(4);
  });

  it('counts the login advert and logs instead of failing when it is refused', async () => {
    // Same shape as client-radio-config.test.ts: a real Client with a spying logger.
    const transport = new MockTransport();
    const radio = new FakeRadio({ self: { name: 'MeshCore-1234' } }).attach(transport);
    const warnings: string[] = [];
    const logger: Logger = { debug() {}, info() {}, warn: (m) => warnings.push(String(m)), error() {} };
    const client = new Client({ transport, logger, radio: new RadioConfig({ name: 'TrainBot' }) });
    await client.login();
    expect(adverts(radio.commands)).toBe(1);

    // The radio "forgets" the name: the next login applies the config again and wants a second flood advert.
    radio.self.name = 'MeshCore-1234';
    transport.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.status).toBe('ready');
    expect(adverts(radio.commands)).toBe(1);
    expect(warnings).toEqual([
      'disconnected from the radio: mock connection lost',
      expect.stringMatching(/^radio: flood advert skipped, /),
    ]);

    await vi.advanceTimersByTimeAsync(ADVERT_FLOOD_INTERVAL_MS);
    radio.self.name = 'MeshCore-1234';
    transport.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(1000);
    expect(adverts(radio.commands)).toBe(2);
  });

  it('reserves the window synchronously so two concurrent flood adverts cannot both pass', async () => {
    const { client, radio } = await setupClient();
    const first = client.radio.sendSelfAdvert(true);
    const second = client.radio.sendSelfAdvert(true);
    await expect(second).rejects.toBeInstanceOf(RateLimitError);
    await expect(first).resolves.toBeUndefined();
    expect(adverts(radio.commands)).toBe(1);
  });

  it('rolls back the window on a firmware refusal, so a later flood advert is still allowed', async () => {
    const { client, radio } = await setupClient();
    radio.refuseSelfAdvert = true;
    await expect(client.radio.sendSelfAdvert(true)).rejects.toBeInstanceOf(RadioError);
    expect(adverts(radio.commands)).toBe(1);

    radio.refuseSelfAdvert = false;
    await expect(client.radio.sendSelfAdvert(true)).resolves.toBeUndefined();
    expect(adverts(radio.commands)).toBe(2);
  });

  it('keeps the window consumed on a timeout, since a lost reply does not prove nothing was sent', async () => {
    const { client, radio } = await setupClient();
    radio.unresponsive = true;
    const failed = expect(client.radio.sendSelfAdvert(true)).rejects.toBeInstanceOf(CommandTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await failed;
    expect(adverts(radio.commands)).toBe(0);

    radio.unresponsive = false;
    await expect(client.radio.sendSelfAdvert(true)).rejects.toBeInstanceOf(RateLimitError);
    expect(adverts(radio.commands)).toBe(0);

    await vi.advanceTimersByTimeAsync(ADVERT_FLOOD_INTERVAL_MS);
    await expect(client.radio.sendSelfAdvert(true)).resolves.toBeUndefined();
    expect(adverts(radio.commands)).toBe(1);
  });
});
