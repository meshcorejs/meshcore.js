import { CommandCode } from '@meshcorejs/protocol';
import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientStateError, CommandTimeoutError, ConnectionError, UnsupportedFirmwareError } from '../src/errors.js';
import { setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Client.login', () => {
  it('runs the handshake in order and emits ready', async () => {
    const { client, radio } = await setupClient({ login: false, device: { maxChannels: 2 } });
    const onReady = vi.fn();
    client.on('ready', onReady);
    await client.login();
    expect(radio.commands).toEqual([
      CommandCode.AppStart,
      CommandCode.DeviceQuery,
      CommandCode.SetDeviceTime,
      CommandCode.GetContacts,
      CommandCode.GetChannel,
      CommandCode.GetChannel,
      CommandCode.SyncNextMessage,
    ]);
    expect(onReady).toHaveBeenCalledOnce();
    expect(client.status).toBe('ready');
    expect(client.isReady).toBe(true);
  });

  it('exposes self, device and the caches without emitting add events', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { client } = await setupClient({
      login: false,
      self: { name: 'TrainBot' },
      device: { maxChannels: 4 },
      contacts: [julie],
      channels: [{ index: 2, name: '#lyon', secret: new Uint8Array(16) }],
    });
    const onAdd = vi.fn();
    client.on('contactAdd', onAdd);
    client.on('channelUpdate', onAdd);
    await client.login();
    expect(client.self.name).toBe('TrainBot');
    expect(client.device.maxChannels).toBe(4);
    expect(client.contacts.cache.get(julie.publicKey)?.name).toBe('Julie');
    expect(client.channels.get('#LYON')?.index).toBe(2);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('throws before login when reading self or device', async () => {
    const { client } = await setupClient({ login: false });
    expect(() => client.self).toThrow(ClientStateError);
    expect(() => client.device).toThrow(ClientStateError);
  });

  it('emits messages queued while offline with backlog = true', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { client, radio } = await setupClient({ login: false, contacts: [julie] });
    radio.receiveContactMessage({ from: julie.publicKey, text: 'tu es là ?' });
    const messages: Array<{ content: string; backlog: boolean }> = [];
    client.on('messageCreate', (m) => messages.push({ content: m.content, backlog: m.backlog }));
    await client.login();
    expect(messages).toEqual([{ content: 'tu es là ?', backlog: true }]);
  });

  it('rejects old firmware', async () => {
    const { client, transport } = await setupClient({ login: false, device: { firmwareVersion: 2 } });
    await expect(client.login()).rejects.toBeInstanceOf(UnsupportedFirmwareError);
    expect(client.status).toBe('idle');
    expect(transport.connected).toBe(false);
  });

  it('wraps transport failures in ConnectionError', async () => {
    const { client, transport } = await setupClient({ login: false });
    transport.failNextConnect(new ConnectionError('ECONNREFUSED'));
    await expect(client.login()).rejects.toThrow('ECONNREFUSED');
    expect(client.status).toBe('idle');
  });

  it('wraps handshake timeouts in ConnectionError', async () => {
    const { client, radio } = await setupClient({ login: false });
    radio.unresponsive = true;
    const login = client.login();
    const assertion = expect(login).rejects.toMatchObject({
      constructor: ConnectionError,
      cause: expect.any(CommandTimeoutError),
    });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('refuses a second login', async () => {
    const { client } = await setupClient();
    await expect(client.login()).rejects.toBeInstanceOf(ClientStateError);
  });

  it('destroy closes the transport and is idempotent', async () => {
    const { client, transport } = await setupClient();
    await client.destroy();
    await client.destroy();
    expect(client.status).toBe('destroyed');
    expect(transport.connected).toBe(false);
  });
});
