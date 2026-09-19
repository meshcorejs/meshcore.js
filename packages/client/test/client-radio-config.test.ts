import { CommandCode } from '@meshcorejs/protocol';
import { FakeRadio, MockTransport } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '../src/client/client.js';
import { RadioConfigError } from '../src/errors.js';
import type { Logger } from '../src/logger.js';
import { RadioConfig } from '../src/radio/radio-config.js';

function setup(config: RadioConfig | undefined, radioOptions: ConstructorParameters<typeof FakeRadio>[0] = {}) {
  const transport = new MockTransport();
  const radio = new FakeRadio({ self: { name: 'MeshCore-1234' }, ...radioOptions }).attach(transport);
  const info: string[] = [];
  const logger: Logger = { debug() {}, info: (m) => info.push(String(m)), warn() {}, error() {} };
  const client = new Client({ transport, logger, ...(config ? { radio: config } : {}) });
  return { transport, radio, client, info };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-18T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Client radio config', () => {
  it('does nothing without a RadioConfig', async () => {
    const { client, radio } = setup(undefined);
    await client.login();
    expect(radio.commands).not.toContain(CommandCode.SetAdvertName);
    expect(client.radioConfig).toBeNull();
  });

  it('applies only the differences, re-reads SELF_INFO and adverts once when the identity changed', async () => {
    const config = new RadioConfig({
      name: 'TrainBot',
      location: { lat: 43.6045, lon: 1.4442 },
      txPower: 22, // already the fake's value → no command
      params: { frequency: 868, bandwidth: 125, spreadingFactor: 7, codingRate: 5 },
    });
    const { client, radio, info } = setup(config);
    await client.login();
    expect(radio.commands.slice(0, 8)).toEqual([
      CommandCode.AppStart,
      CommandCode.DeviceQuery,
      CommandCode.SetDeviceTime,
      CommandCode.SetAdvertName,
      CommandCode.SetAdvertLatLon,
      CommandCode.SetRadioParams,
      CommandCode.AppStart,
      CommandCode.SendSelfAdvert,
    ]);
    expect(client.self.name).toBe('TrainBot');
    expect(client.self.radio.frequencyKhz).toBe(868000);
    expect(client.radioConfig).toBe(config);
    expect(info).toEqual([
      'radio: name "MeshCore-1234" → "TrainBot"',
      'radio: location (0, 0) → (43.6045, 1.4442)',
      'radio: params 869.525 MHz / 250 kHz / SF11 / CR5 → 868 MHz / 125 kHz / SF7 / CR5',
      'radio: advert sent (identity changed)',
    ]);
  });

  it('does not advert when only tx power or LoRa params change', async () => {
    const { client, radio } = setup(new RadioConfig({ txPower: 14 }));
    await client.login();
    expect(radio.commands).toContain(CommandCode.SetRadioTxPower);
    expect(radio.commands).not.toContain(CommandCode.SendSelfAdvert);
    expect(radio.commands.filter((c) => c === CommandCode.AppStart)).toHaveLength(2);
  });

  it('sends no command and no second APP_START when the radio already matches', async () => {
    const { client, radio } = setup(new RadioConfig({ name: 'MeshCore-1234', txPower: 22 }));
    await client.login();
    expect(radio.commands.filter((c) => c === CommandCode.AppStart)).toHaveLength(1);
    expect(radio.commands).not.toContain(CommandCode.SetAdvertName);
  });

  it('passes the repeat byte only on firmware 9+ and keeps the current value', async () => {
    const params = { frequency: 868, bandwidth: 125, spreadingFactor: 7, codingRate: 5 };
    const modern = setup(new RadioConfig({ params }), { device: { firmwareVersion: 13, repeatEnabled: true } });
    await modern.client.login();
    expect(modern.transport.written.find((f) => f[0] === CommandCode.SetRadioParams)?.length).toBe(12);
    expect(modern.radio.device.repeatEnabled).toBe(true);

    const old = setup(new RadioConfig({ params }), { device: { firmwareVersion: 8 } });
    await old.client.login();
    expect(old.transport.written.find((f) => f[0] === CommandCode.SetRadioParams)?.length).toBe(11);
  });

  it('fails login with RadioConfigError when txPower exceeds the radio maximum, without sending it', async () => {
    const { client, radio } = setup(new RadioConfig({ txPower: 30 }), { self: { maxTxPowerDbm: 22 } });
    await expect(client.login()).rejects.toMatchObject({
      code: 'RADIO_CONFIG_REJECTED',
      setting: 'txPower',
      message: "txPower 30 dBm exceeds the radio's maximum (22 dBm)",
    });
    expect(radio.commands).not.toContain(CommandCode.SetRadioTxPower);
    expect(client.status).toBe('idle');
  });

  it('fails login with RadioConfigError when the radio refuses a setting', async () => {
    // FakeRadio refuses any tx power above self.maxTxPowerDbm; make the pre-check pass and the radio refuse.
    const { client, radio, transport } = setup(new RadioConfig({ txPower: 20 }), { self: { maxTxPowerDbm: 22 } });
    radio.self.maxTxPowerDbm = 22;
    const originalWrite = transport.write.bind(transport);
    transport.write = async (payload) => {
      if (payload[0] === CommandCode.SetRadioTxPower) radio.self.maxTxPowerDbm = 10; // radio "changes its mind"
      return originalWrite(payload);
    };
    const error = await client.login().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RadioConfigError);
    expect((error as RadioConfigError).setting).toBe('txPower');
    expect((error as RadioConfigError).radioCode).toBe(6);
    expect((error as RadioConfigError).message).toBe('txPower: radio rejected SET_RADIO_TX_POWER: illegal argument');
    expect(transport.connected).toBe(false);
  });

  it('re-applies the diff after a reconnection', async () => {
    const { client, radio, transport } = setup(new RadioConfig({ name: 'TrainBot' }));
    await client.login();
    radio.self.name = 'Renamed-by-app'; // someone changed it from the phone while we were away
    radio.commands.length = 0;
    transport.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(1000);
    expect(radio.commands).toContain(CommandCode.SetAdvertName);
    expect(client.self.name).toBe('TrainBot');
  });
});
