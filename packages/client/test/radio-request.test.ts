import { CommandCode } from '@meshcorejs/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuardedCommandError, RadioError } from '../src/errors.js';
import { expectType } from '../src/radio/radio.js';
import { setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-22T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('radio.request()', () => {
  it('sends an arbitrary Companion command through the request queue and decodes its answer', async () => {
    const { client, radio } = await setupClient();
    const before = radio.commands.length;
    const batt = await client.radio.request(
      CommandCode.GetBattAndStorage,
      new Uint8Array(0),
      expectType('battAndStorage', (f) => f),
    );
    expect(batt.type).toBe('battAndStorage');
    expect(radio.commands.slice(before)).toEqual([CommandCode.GetBattAndStorage]);
  });

  it('defaults to expecting Ok and turns Err into RadioError', async () => {
    const { client } = await setupClient();
    await expect(client.radio.request(0x7e)).rejects.toBeInstanceOf(RadioError);
    await expect(client.radio.request(0x7e)).rejects.toMatchObject({ command: 'CMD_0x7e' });
  });

  it('refuses the three commands that transmit on the mesh, without touching the transport', async () => {
    const { client, radio } = await setupClient();
    const before = radio.commands.length;
    for (const code of [CommandCode.SendTxtMsg, CommandCode.SendChannelTxtMsg, CommandCode.SendSelfAdvert]) {
      await expect(client.radio.request(code, new Uint8Array(4))).rejects.toBeInstanceOf(GuardedCommandError);
      await expect(client.radio.request(code, new Uint8Array(4))).rejects.toMatchObject({ code: 'GUARDED_COMMAND' });
    }
    expect(radio.commands).toHaveLength(before);
  });

  it('validates the code byte', async () => {
    const { client } = await setupClient();
    await expect(client.radio.request(256)).rejects.toBeInstanceOf(RangeError);
    await expect(client.radio.request(-1)).rejects.toBeInstanceOf(RangeError);
  });
});
