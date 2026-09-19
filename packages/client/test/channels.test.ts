import { createHash } from 'node:crypto';
import { toHex } from '@meshcorejs/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LimitReachedError, MeshcoreError } from '../src/errors.js';
import { hashtagChannelSecret } from '../src/managers/channel-manager.js';
import { setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const publicChannel = { index: 0, name: 'Public', secret: new Uint8Array(16).fill(1) };

describe('ChannelManager', () => {
  it('derives hashtag secrets from SHA-256 of the name', () => {
    const expected = createHash('sha256').update('#lyon').digest().subarray(0, 16);
    expect(toHex(hashtagChannelSecret('#lyon'))).toBe(toHex(expected));
  });

  it('creates a hashtag channel in the first free slot', async () => {
    const { client, radio } = await setupClient({ channels: [publicChannel] });
    const updates = vi.fn();
    client.on('channelUpdate', updates);
    const channel = await client.channels.create({ name: 'lyon' });
    expect(channel.index).toBe(1);
    expect(channel.name).toBe('#lyon');
    expect(channel.isHashtag).toBe(true);
    expect(toHex(channel.secret)).toBe(toHex(hashtagChannelSecret('#lyon')));
    expect(radio.channels[1]?.name).toBe('#lyon');
    expect(updates).toHaveBeenCalledWith(null, channel);
  });

  it('creates a private channel with an explicit secret', async () => {
    const { client } = await setupClient();
    const secret = new Uint8Array(16).fill(9);
    const channel = await client.channels.create({ name: 'staff', secret });
    expect(channel.name).toBe('staff');
    expect(channel.isHashtag).toBe(false);
    expect(channel.secret).toEqual(secret);
  });

  it('rejects duplicates, bad names and full radios', async () => {
    const { client } = await setupClient({ device: { maxChannels: 1 }, channels: [publicChannel] });
    await expect(client.channels.create({ name: 'Public', secret: new Uint8Array(16) })).rejects.toBeInstanceOf(
      MeshcoreError,
    );
    await expect(client.channels.create({ name: 'x'.repeat(40) })).rejects.toBeInstanceOf(RangeError);
    await expect(client.channels.create({ name: '#lyon' })).rejects.toBeInstanceOf(LimitReachedError);
  });

  it('deletes a channel by name, index or instance', async () => {
    const { client, radio } = await setupClient({ channels: [publicChannel] });
    const updates: Array<[string | undefined, string | undefined]> = [];
    client.on('channelUpdate', (old, current) => updates.push([old?.name, current?.name]));
    await client.channels.create({ name: '#lyon' });
    await client.channels.delete('#lyon');
    await client.channels.delete(0);
    expect(radio.channels.every((slot) => slot === null)).toBe(true);
    expect(client.channels.cache.size).toBe(0);
    expect(updates).toEqual([
      [undefined, '#lyon'],
      ['#lyon', undefined],
      ['Public', undefined],
    ]);
  });
});
