import { describe, expect, it } from 'vitest';
import { fromHex } from '../src/bytes.js';
import { decodeFrame } from '../src/decode/decode-frame.js';
import { FRAMES, PUBLIC_KEY } from './fixtures.js';

const decode = (hex: string) => decodeFrame(fromHex(hex));

describe('decodeFrame — simple responses', () => {
  it('OK / ERR / DISABLED', () => {
    expect(decode('00')).toEqual({ kind: 'response', type: 'ok' });
    expect(decode('0102')).toEqual({ kind: 'response', type: 'err', errorCode: 2 });
    expect(decode('01')).toEqual({ kind: 'response', type: 'err', errorCode: null });
    expect(decode('0f')).toEqual({ kind: 'response', type: 'disabled' });
  });

  it('contact list delimiters', () => {
    expect(decode('0205000000')).toEqual({ kind: 'response', type: 'contactsStart', total: 5 });
    expect(decode('040078e768')).toEqual({
      kind: 'response',
      type: 'endOfContacts',
      mostRecentLastModified: 1760000000,
    });
  });

  it('EXPORT_CONTACT carries the raw advert packet', () => {
    expect(decode(FRAMES.exportContact)).toEqual({
      kind: 'response',
      type: 'exportContact',
      packet: fromHex('1011121314151617'),
    });
  });

  it('SENT', () => {
    expect(decode(FRAMES.sent)).toEqual({
      kind: 'response',
      type: 'sent',
      flood: true,
      expectedAck: 0xcafebabe,
      suggestedTimeoutMs: 12000,
    });
  });

  it('CURR_TIME / NO_MORE_MESSAGES', () => {
    expect(decode('090078e768')).toEqual({ kind: 'response', type: 'currentTime', epochSeconds: 1760000000 });
    expect(decode('0a')).toEqual({ kind: 'response', type: 'noMoreMessages' });
  });

  it('BATT_AND_STORAGE with and without storage', () => {
    expect(decode(FRAMES.battAndStorage)).toEqual({
      kind: 'response',
      type: 'battAndStorage',
      batteryMillivolts: 4012,
      storageUsedKb: 128,
      storageTotalKb: 1024,
    });
    expect(decode(FRAMES.battOnly)).toMatchObject({
      batteryMillivolts: 3900,
      storageUsedKb: null,
      storageTotalKb: null,
    });
  });

  it('CHANNEL_INFO', () => {
    expect(decode(FRAMES.channelInfo)).toEqual({
      kind: 'response',
      type: 'channelInfo',
      channel: { index: 3, name: '#lyon', secret: fromHex('a0a1a2a3a4a5a6a7a8a9aaabacadaeaf') },
    });
  });
});

describe('decodeFrame — records', () => {
  it('CONTACT', () => {
    expect(decode(FRAMES.contact)).toEqual({
      kind: 'response',
      type: 'contact',
      contact: {
        publicKey: PUBLIC_KEY,
        type: 1,
        flags: 0,
        outPath: { hashSize: 1, hops: [Uint8Array.of(0xa1), Uint8Array.of(0xb2)] },
        name: 'Julie',
        lastAdvertTimestamp: 1760000000,
        latitude: 45.764043,
        longitude: 4.835659,
        lastModified: 1760000100,
      },
    });
  });

  it('NEW_ADVERT push carries a full contact with unknown path', () => {
    const frame = decode(FRAMES.newAdvert);
    expect(frame).toMatchObject({ kind: 'push', type: 'newAdvert' });
    if (frame.type !== 'newAdvert') throw new Error('unreachable');
    expect(frame.contact).toMatchObject({ name: 'Relais Fourvière', type: 2, flags: 1, outPath: null, latitude: 0 });
  });

  it('SELF_INFO', () => {
    expect(decode(FRAMES.selfInfo)).toEqual({
      kind: 'response',
      type: 'selfInfo',
      selfInfo: {
        advertType: 1,
        txPowerDbm: 22,
        maxTxPowerDbm: 30,
        publicKey: PUBLIC_KEY,
        latitude: 45.764043,
        longitude: 4.835659,
        multiAcks: 1,
        advertLocationPolicy: 2,
        telemetryModes: { base: 2, location: 1, environment: 3 },
        manualAddContacts: true,
        radio: { frequencyKhz: 869525, bandwidthHz: 250000, spreadingFactor: 11, codingRate: 5 },
        name: 'TrainBot',
      },
    });
  });

  it('DEVICE_INFO (current firmware)', () => {
    expect(decode(FRAMES.deviceInfo)).toEqual({
      kind: 'response',
      type: 'deviceInfo',
      deviceInfo: {
        firmwareVersion: 13,
        maxContacts: 100,
        maxChannels: 40,
        blePin: 123456,
        firmwareBuildDate: '24 Aug 2026',
        manufacturer: 'Heltec V3',
        firmwareVersionName: 'v1.9.0',
        repeatEnabled: false,
        pathHashMode: 1,
      },
    });
  });

  it('DEVICE_INFO (pre-v3 firmware) leaves optional fields null', () => {
    expect(decode(FRAMES.deviceInfoOld)).toMatchObject({
      type: 'deviceInfo',
      deviceInfo: { firmwareVersion: 2, maxContacts: null, maxChannels: null, repeatEnabled: null },
    });
  });
});

describe('decodeFrame — messages', () => {
  it('contact message V3 with SNR and flood hops', () => {
    expect(decode(FRAMES.contactMessageV3)).toEqual({
      kind: 'response',
      type: 'contactMessage',
      version: 3,
      snr: -9.5,
      senderPrefix: '101112131415',
      pathLen: 3,
      hopCount: 3,
      txtType: 0,
      senderTimestamp: 1760000300,
      signature: null,
      text: '/train 6607',
    });
  });

  it('contact message V2 via direct route', () => {
    expect(decode(FRAMES.contactMessageV2)).toMatchObject({
      type: 'contactMessage',
      version: 2,
      snr: null,
      pathLen: 0xff,
      hopCount: null,
      text: 'salut',
    });
  });

  it('signed contact message exposes the 4 signature bytes', () => {
    expect(decode(FRAMES.contactMessageSigned)).toMatchObject({
      snr: 2,
      txtType: 2,
      signature: 'deadbeef',
      text: 'ok',
    });
  });

  it('channel message V3 keeps the sender prefix in the text', () => {
    expect(decode(FRAMES.channelMessageV3)).toEqual({
      kind: 'response',
      type: 'channelMessage',
      version: 3,
      snr: 5,
      channelIndex: 2,
      pathLen: 5,
      hopCount: 5,
      txtType: 0,
      senderTimestamp: 1760000400,
      text: 'Léa: @TrainBot departs lyon',
    });
  });

  it('channel message V2', () => {
    expect(decode('080100009079e76868656c6c6f')).toMatchObject({
      type: 'channelMessage',
      version: 2,
      snr: null,
      channelIndex: 1,
      pathLen: 0,
      hopCount: 0,
      text: 'hello',
    });
  });
});

describe('decodeFrame — pushes', () => {
  it('key-only pushes', () => {
    expect(decode(`80${PUBLIC_KEY}`)).toEqual({ kind: 'push', type: 'advert', publicKey: PUBLIC_KEY });
    expect(decode(`81${PUBLIC_KEY}`)).toEqual({ kind: 'push', type: 'pathUpdated', publicKey: PUBLIC_KEY });
    expect(decode(`8f${PUBLIC_KEY}`)).toEqual({ kind: 'push', type: 'contactDeleted', publicKey: PUBLIC_KEY });
  });

  it('SEND_CONFIRMED', () => {
    expect(decode(FRAMES.sendConfirmed)).toEqual({
      kind: 'push',
      type: 'sendConfirmed',
      ack: 0xcafebabe,
      roundTripMs: 3450,
    });
  });

  it('MSG_WAITING / CONTACTS_FULL', () => {
    expect(decode('83')).toEqual({ kind: 'push', type: 'msgWaiting' });
    expect(decode('90')).toEqual({ kind: 'push', type: 'contactsFull' });
  });
});

describe('decodeFrame — robustness', () => {
  it('returns unknown for unsupported codes', () => {
    expect(decode('1b0102')).toEqual({ kind: 'response', type: 'unknown', code: 0x1b, bytes: fromHex('1b0102') });
    expect(decode('89')).toMatchObject({ kind: 'push', type: 'unknown', code: 0x89 });
  });

  it('returns malformed for truncated frames instead of throwing', () => {
    expect(decode('0601be')).toMatchObject({ kind: 'response', type: 'malformed', code: 6 });
    expect(decode(FRAMES.contact.slice(0, 100))).toMatchObject({ type: 'malformed', code: 3 });
    expect(decodeFrame(new Uint8Array(0))).toMatchObject({ type: 'malformed', code: -1, reason: 'empty frame' });
  });

  it('returns malformed for an invalid path length byte', () => {
    const broken = `03${PUBLIC_KEY}0100c1${FRAMES.contact.slice(2 + 64 + 6)}`;
    expect(decode(broken)).toMatchObject({ type: 'malformed', code: 3 });
  });
});
