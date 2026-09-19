import {
  CommandCode,
  type DecodedFrame,
  decodeFrame,
  encodeAppStart,
  encodeDeviceQuery,
  encodeExportContact,
  encodeGetChannel,
  encodeGetContacts,
  encodeRemoveContact,
  encodeSendChannelTxtMsg,
  encodeSendTxtMsg,
  encodeSetAdvertLatLon,
  encodeSetAdvertName,
  encodeSetChannel,
  encodeSetDeviceTime,
  encodeSetRadioParams,
  encodeSetRadioTxPower,
  encodeSyncNextMessage,
  RadioErrorCode,
} from '@meshcorejs/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionError } from '../src/errors.js';
import { FakeRadio, fakeContactRecord } from '../src/mock/fake-radio.js';
import { MockTransport } from '../src/mock/mock-transport.js';

async function setup(options: ConstructorParameters<typeof FakeRadio>[0] = {}) {
  const transport = new MockTransport();
  const radio = new FakeRadio(options).attach(transport);
  const frames: DecodedFrame[] = [];
  transport.on('frame', (payload) => frames.push(decodeFrame(payload)));
  await transport.connect();
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const send = async (payload: Uint8Array) => {
    frames.length = 0;
    await transport.write(payload);
    await vi.advanceTimersByTimeAsync(0);
    return [...frames];
  };
  return { transport, radio, frames, flush, send };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MockTransport', () => {
  it('records writes and delivers frames asynchronously', async () => {
    const transport = new MockTransport();
    await transport.connect();
    const onFrame = vi.fn();
    transport.on('frame', onFrame);
    transport.receive(Uint8Array.of(0));
    expect(onFrame).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(onFrame).toHaveBeenCalledWith(Uint8Array.of(0));
    await transport.write(Uint8Array.of(1));
    expect(transport.written).toEqual([Uint8Array.of(1)]);
  });

  it('can fail the next connect and simulate a disconnection', async () => {
    const transport = new MockTransport();
    transport.failNextConnect();
    await expect(transport.connect()).rejects.toBeInstanceOf(ConnectionError);
    await transport.connect();
    const onClose = vi.fn();
    transport.on('close', onClose);
    transport.simulateDisconnect();
    expect(onClose).toHaveBeenCalledWith(expect.any(ConnectionError));
    expect(transport.connected).toBe(false);
    expect(transport.connectCount).toBe(2);
  });
});

describe('FakeRadio', () => {
  it('answers the handshake', async () => {
    const { send, radio } = await setup({ self: { name: 'TrainBot' }, device: { maxChannels: 40 } });
    expect(await send(encodeAppStart('test'))).toMatchObject([{ type: 'selfInfo', selfInfo: { name: 'TrainBot' } }]);
    expect(await send(encodeDeviceQuery(3))).toMatchObject([
      { type: 'deviceInfo', deviceInfo: { firmwareVersion: 13, maxChannels: 40 } },
    ]);
    expect(radio.appTargetVersion).toBe(3);
    expect(radio.commands).toEqual([CommandCode.AppStart, CommandCode.DeviceQuery]);
  });

  it('exports the node contact card', async () => {
    const { send } = await setup({ selfAdvertPacket: Uint8Array.from([1, 2, 3]) });
    expect(await send(encodeExportContact())).toMatchObject([
      { type: 'exportContact', packet: Uint8Array.from([1, 2, 3]) },
    ]);
  });

  it('lists contacts and removes them', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const marc = fakeContactRecord({ name: 'Marc' });
    const { send } = await setup({ contacts: [julie, marc] });
    expect((await send(encodeGetContacts())).map((f) => f.type)).toEqual([
      'contactsStart',
      'contact',
      'contact',
      'endOfContacts',
    ]);
    expect(await send(encodeRemoveContact(julie.publicKey))).toEqual([{ kind: 'response', type: 'ok' }]);
    expect(await send(encodeRemoveContact(julie.publicKey))).toEqual([
      { kind: 'response', type: 'err', errorCode: RadioErrorCode.NotFound },
    ]);
  });

  it('gives distinct deterministic keys to fake contacts', () => {
    const a = fakeContactRecord({ name: 'Julie' });
    expect(fakeContactRecord({ name: 'Julie' }).publicKey).toBe(a.publicKey);
    expect(fakeContactRecord({ name: 'Marc' }).publicKey.slice(0, 12)).not.toBe(a.publicKey.slice(0, 12));
    expect(a.publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to move the clock backwards', async () => {
    const { send, radio } = await setup();
    expect(await send(encodeSetDeviceTime(radio.clock - 10))).toMatchObject([
      { type: 'err', errorCode: RadioErrorCode.IllegalArg },
    ]);
    expect(await send(encodeSetDeviceTime(radio.clock + 3600))).toMatchObject([{ type: 'ok' }]);
  });

  it('manages channel slots', async () => {
    const { send, radio } = await setup({ device: { maxChannels: 2 } });
    const secret = new Uint8Array(16).fill(7);
    expect(await send(encodeSetChannel({ index: 1, name: '#lyon', secret }))).toMatchObject([{ type: 'ok' }]);
    expect(await send(encodeGetChannel(1))).toMatchObject([
      { type: 'channelInfo', channel: { index: 1, name: '#lyon' } },
    ]);
    expect(await send(encodeGetChannel(0))).toMatchObject([{ type: 'channelInfo', channel: { name: '' } }]);
    expect(await send(encodeGetChannel(2))).toMatchObject([{ type: 'err', errorCode: RadioErrorCode.NotFound }]);
    expect(radio.channels[1]?.name).toBe('#lyon');
  });

  it('queues incoming messages behind MSG_WAITING', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { send, radio, frames } = await setup({ contacts: [julie] });
    await send(encodeDeviceQuery(3));
    frames.length = 0;
    radio.receiveContactMessage({ from: julie.publicKey, text: '/train 6607', snr: -4 });
    radio.receiveChannelMessage({ channelIndex: 0, senderName: 'Léa', text: 'salut' });
    await vi.advanceTimersByTimeAsync(0);
    expect(frames.map((f) => f.type)).toEqual(['msgWaiting', 'msgWaiting']);
    expect(radio.pendingMessages).toBe(2);

    expect(await send(encodeSyncNextMessage())).toMatchObject([
      { type: 'contactMessage', version: 3, snr: -4, senderPrefix: julie.publicKey.slice(0, 12), text: '/train 6607' },
    ]);
    expect(await send(encodeSyncNextMessage())).toMatchObject([{ type: 'channelMessage', text: 'Léa: salut' }]);
    expect(await send(encodeSyncNextMessage())).toMatchObject([{ type: 'noMoreMessages' }]);
  });

  it('answers DMs with SENT and an automatic ACK', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { send, radio, frames } = await setup({ contacts: [julie], suggestedTimeoutMs: 5000 });
    const [sent] = await send(encodeSendTxtMsg({ recipient: julie.publicKey, text: 'pong', timestamp: radio.clock }));
    expect(sent).toMatchObject({ type: 'sent', flood: true, suggestedTimeoutMs: 5000 });
    expect(radio.sent).toMatchObject([{ kind: 'dm', text: 'pong', attempt: 0 }]);

    frames.length = 0;
    await vi.advanceTimersByTimeAsync(50);
    expect(frames).toMatchObject([{ type: 'sendConfirmed', ack: (sent as { expectedAck: number }).expectedAck }]);
  });

  it('can withhold ACKs', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { send, radio, frames } = await setup({ contacts: [julie] });
    radio.ackMode = 'never';
    await send(encodeSendTxtMsg({ recipient: julie.publicKey, text: 'pong', timestamp: radio.clock }));
    frames.length = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(frames).toEqual([]);
  });

  it('records channel messages with the firmware sender prefix and truncation', async () => {
    const secret = new Uint8Array(16);
    const { send, radio } = await setup({
      self: { name: 'TrainBot' },
      channels: [{ index: 0, name: 'Public', secret }],
    });
    expect(await send(encodeSendChannelTxtMsg({ channelIndex: 0, text: 'a'.repeat(160), timestamp: 1 }))).toMatchObject(
      [{ type: 'ok' }],
    );
    const [message] = radio.sent;
    expect(message).toMatchObject({ kind: 'channel', channelName: 'Public' });
    expect(message?.kind === 'channel' && message.wireText).toBe(`TrainBot: ${'a'.repeat(150)}`);
    expect(await send(encodeSendChannelTxtMsg({ channelIndex: 3, text: 'x', timestamp: 1 }))).toMatchObject([
      { type: 'err', errorCode: RadioErrorCode.NotFound },
    ]);
  });

  it('auto-adds heard nodes and announces them with ADVERT', async () => {
    const { radio, frames } = await setup();
    const relay = fakeContactRecord({ name: 'Relais', type: 2 });
    radio.hearAdvert(relay);
    radio.hearAdvert(relay);
    await vi.advanceTimersByTimeAsync(0);
    expect(frames.map((f) => f.type)).toEqual(['advert', 'advert']);
    expect(radio.contacts.has(relay.publicKey)).toBe(true);
  });

  it('only announces unknown nodes with NEW_ADVERT in manual-add mode or when full', async () => {
    const manual = await setup({ self: { manualAddContacts: true } });
    manual.radio.hearAdvert(fakeContactRecord({ name: 'Relais' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(manual.frames.map((f) => f.type)).toEqual(['newAdvert']);
    expect(manual.radio.contacts.size).toBe(0);

    const full = await setup({
      device: { maxContacts: 2 },
      contacts: [fakeContactRecord({ name: 'A' }), fakeContactRecord({ name: 'B' })],
    });
    full.radio.hearAdvert(fakeContactRecord({ name: 'C' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(full.frames.map((f) => f.type)).toEqual(['newAdvert', 'contactsFull']);
  });

  it('stays silent when unresponsive', async () => {
    const { send, radio } = await setup();
    radio.unresponsive = true;
    expect(await send(encodeAppStart('x'))).toEqual([]);
  });

  it('applies SET_ADVERT_NAME and SET_ADVERT_LATLON to self', async () => {
    const { send, radio } = await setup();
    expect(await send(encodeSetAdvertName('TrainBot'))).toMatchObject([{ type: 'ok' }]);
    expect(radio.self.name).toBe('TrainBot');
    expect(await send(encodeSetAdvertLatLon({ latitude: 43.6045, longitude: 1.4442 }))).toMatchObject([{ type: 'ok' }]);
    expect(radio.self.latitude).toBeCloseTo(43.6045, 6);
    expect(radio.self.longitude).toBeCloseTo(1.4442, 6);
  });

  it('applies SET_RADIO_TX_POWER within the board maximum', async () => {
    const { send, radio } = await setup({ self: { maxTxPowerDbm: 20 } });
    expect(await send(encodeSetRadioTxPower(14))).toMatchObject([{ type: 'ok' }]);
    expect(radio.self.txPowerDbm).toBe(14);
    expect(await send(encodeSetRadioTxPower(22))).toMatchObject([
      { type: 'err', errorCode: RadioErrorCode.IllegalArg },
    ]);
    expect(await send(encodeSetRadioTxPower(-10))).toMatchObject([
      { type: 'err', errorCode: RadioErrorCode.IllegalArg },
    ]);
    expect(radio.self.txPowerDbm).toBe(14);
  });

  it('applies SET_RADIO_PARAMS and the optional repeat byte', async () => {
    const { send, radio } = await setup();
    const params = { frequencyKhz: 868000, bandwidthHz: 125000, spreadingFactor: 7, codingRate: 8 };
    expect(await send(encodeSetRadioParams(params))).toMatchObject([{ type: 'ok' }]);
    expect(radio.self.radio).toEqual({ frequencyKhz: 868000, bandwidthHz: 125000, spreadingFactor: 7, codingRate: 8 });
    expect(radio.device.repeatEnabled).toBe(false);
    expect(await send(encodeSetRadioParams({ ...params, repeat: true }))).toMatchObject([{ type: 'ok' }]);
    expect(radio.device.repeatEnabled).toBe(true);
  });

  it('refuses SET_RADIO_PARAMS outside the firmware ranges', async () => {
    const { send, radio } = await setup();
    // Hand-built frame: freq 100 000 kHz (< 150 000), the encoder would refuse it.
    const frame = Uint8Array.from([0x0b, 0xa0, 0x86, 0x01, 0x00, 0x90, 0xd0, 0x03, 0x00, 0x0b, 0x05]);
    expect(await send(frame)).toMatchObject([{ type: 'err', errorCode: RadioErrorCode.IllegalArg }]);
    expect(radio.self.radio.frequencyKhz).toBe(869525);
  });
});
