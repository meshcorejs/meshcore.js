import { CommandCode, RadioErrorCode } from '@meshcorejs/protocol';
import { FakeRadio, fakeContactRecord, MockTransport } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RadioError } from '../src/errors.js';
import { Radio } from '../src/radio/radio.js';

async function setup(options: ConstructorParameters<typeof FakeRadio>[0] = {}) {
  const transport = new MockTransport();
  const fake = new FakeRadio(options).attach(transport);
  const radio = new Radio(transport);
  await transport.connect();
  return { transport, fake, radio };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Radio', () => {
  it('performs the handshake', async () => {
    const { radio } = await setup({ self: { name: 'TrainBot' } });
    expect((await radio.appStart('meshcore.js')).name).toBe('TrainBot');
    expect((await radio.deviceQuery()).firmwareVersion).toBe(13);
  });

  it('collects the whole contact list', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const marc = fakeContactRecord({ name: 'Marc' });
    const { radio } = await setup({ contacts: [julie, marc] });
    expect((await radio.getContacts()).map((c) => c.name)).toEqual(['Julie', 'Marc']);
  });

  it('maps NOT_FOUND to null for lookups', async () => {
    const { radio } = await setup({ device: { maxChannels: 2 } });
    expect(await radio.getContactByKey('ab'.repeat(32))).toBeNull();
    expect(await radio.getChannel(5)).toBeNull();
    expect(await radio.getChannel(1)).toMatchObject({ index: 1, name: '' });
  });

  it('ignores ILLEGAL_ARG when the radio clock is ahead', async () => {
    const { radio, fake } = await setup();
    await expect(radio.setDeviceTime(fake.clock - 60)).resolves.toBeUndefined();
  });

  it('propagates other radio errors', async () => {
    const { radio } = await setup();
    await expect(radio.removeContact('ab'.repeat(32))).rejects.toMatchObject({
      constructor: RadioError,
      radioCode: RadioErrorCode.NotFound,
    });
  });

  it('syncs messages one by one', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { radio, fake } = await setup({ contacts: [julie] });
    await radio.deviceQuery();
    fake.receiveContactMessage({ from: julie.publicKey, text: 'salut' });
    expect(await radio.syncNextMessage()).toMatchObject({ type: 'contactMessage', text: 'salut' });
    expect(await radio.syncNextMessage()).toBeNull();
  });

  it('routes pushes to the push event, not to the request in flight', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { radio, fake } = await setup({ contacts: [julie] });
    const pushes: string[] = [];
    radio.on('push', (frame) => pushes.push(frame.type));
    const sent = await radio.sendText({ recipient: julie.publicKey, text: 'pong', timestamp: fake.clock });
    expect(sent).toMatchObject({ type: 'sent', flood: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(pushes).toEqual(['sendConfirmed']);
  });

  it('exports the node contact card as a meshcore:// link', async () => {
    const { radio } = await setup({ selfAdvertPacket: Uint8Array.from([0xab, 0xcd]) });
    expect(await radio.exportSelfContact()).toEqual({ packet: Uint8Array.from([0xab, 0xcd]), uri: 'meshcore://abcd' });
  });

  it('sends channel text and self adverts', async () => {
    const { radio, fake } = await setup({ channels: [{ index: 0, name: 'Public', secret: new Uint8Array(16) }] });
    await radio.sendChannelText({ channelIndex: 0, text: 'hello', timestamp: fake.clock });
    await radio.sendSelfAdvert(true);
    expect(fake.sent).toMatchObject([{ kind: 'channel', text: 'hello' }]);
  });

  it('rejects pending commands on reset', async () => {
    const { radio, fake } = await setup();
    fake.unresponsive = true;
    const pending = radio.appStart('x');
    radio.reset(new Error('gone'));
    await expect(pending).rejects.toThrow('gone');
  });

  it('sets the advert name, location, tx power and LoRa params in app units', async () => {
    const { radio, fake } = await setup();
    await radio.setAdvertName('TrainBot');
    await radio.setAdvertLatLon({ lat: 43.6045, lon: 1.4442 });
    await radio.setTxPower(14);
    await radio.setRadioParams({ frequency: 868, bandwidth: 125, spreadingFactor: 7, codingRate: 8 });
    expect(fake.self.name).toBe('TrainBot');
    expect(fake.self.latitude).toBeCloseTo(43.6045, 6);
    expect(fake.self.txPowerDbm).toBe(14);
    expect(fake.self.radio).toEqual({ frequencyKhz: 868000, bandwidthHz: 125000, spreadingFactor: 7, codingRate: 8 });
    expect(fake.commands).toEqual([
      CommandCode.SetAdvertName,
      CommandCode.SetAdvertLatLon,
      CommandCode.SetRadioTxPower,
      CommandCode.SetRadioParams,
    ]);
  });

  it('writes the repeat byte only when asked', async () => {
    const { radio, fake, transport } = await setup();
    const params = { frequency: 868, bandwidth: 125, spreadingFactor: 7, codingRate: 8 };
    await radio.setRadioParams(params);
    expect(transport.written.at(-1)?.length).toBe(11);
    await radio.setRadioParams(params, { repeat: true });
    expect(transport.written.at(-1)?.length).toBe(12);
    expect(fake.device.repeatEnabled).toBe(true);
  });

  it('validates before touching the radio and surfaces radio refusals as RadioError', async () => {
    const { radio, fake } = await setup({ self: { maxTxPowerDbm: 20 } });
    await expect(radio.setTxPower(-10)).rejects.toThrow(RangeError);
    await expect(radio.setAdvertName('')).rejects.toThrow(RangeError);
    expect(fake.commands).toEqual([]);
    await expect(radio.setTxPower(22)).rejects.toMatchObject({ radioCode: RadioErrorCode.IllegalArg });
    await expect(radio.setTxPower(22)).rejects.toBeInstanceOf(RadioError);
  });
});
