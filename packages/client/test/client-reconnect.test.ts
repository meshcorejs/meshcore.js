import { CommandCode } from '@meshcorejs/protocol';
import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_CHECK_INTERVAL_MS } from '../src/client/client.js';
import { ConnectionError } from '../src/errors.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reconnection', () => {
  it('emits disconnect, reconnects after 1 s and emits ready again', async () => {
    const { client, transport } = await setupClient();
    const events: string[] = [];
    client.on('disconnect', () => events.push('disconnect'));
    client.on('reconnecting', (attempt, delay) => events.push(`reconnecting ${attempt} ${delay}`));
    client.on('ready', () => events.push('ready'));

    transport.simulateDisconnect(new ConnectionError('cable pulled'));
    expect(client.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(999);
    expect(events).toEqual(['disconnect', 'reconnecting 1 1000']);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(['disconnect', 'reconnecting 1 1000', 'ready']);
    expect(client.status).toBe('ready');
    expect(transport.connectCount).toBe(2);
  });

  it('backs off exponentially up to 60 s while the radio is unreachable', async () => {
    const { client, transport } = await setupClient();
    const delays: number[] = [];
    client.on('reconnecting', (_attempt, delay) => delays.push(delay));
    const connect = vi.spyOn(transport, 'connect').mockRejectedValue(new ConnectionError('ECONNREFUSED'));

    transport.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16000 + 32000 + 60000);
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);

    connect.mockRestore();
    await vi.advanceTimersByTimeAsync(60000);
    expect(client.status).toBe('ready');
  });

  it('only reports cache differences after reconnecting', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const marc = fakeContactRecord({ name: 'Marc' });
    const { client, radio, transport } = await setupClient({ contacts: [julie] });
    const added = vi.fn();
    client.on('contactAdd', added);
    transport.simulateDisconnect();
    radio.contacts.set(marc.publicKey, marc);
    await vi.advanceTimersByTimeAsync(1000);
    expect(added).toHaveBeenCalledOnce();
    expect(added.mock.calls[0]?.[0].name).toBe('Marc');
  });

  it('delivers messages received during the outage as backlog', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { client, radio, transport } = await setupClient({ contacts: [julie] });
    const backlog: boolean[] = [];
    client.on('messageCreate', (m) => backlog.push(m.backlog));
    transport.simulateDisconnect();
    radio.receiveContactMessage({ from: julie.publicKey, text: 'hors ligne' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(backlog).toEqual([true]);
  });

  it('reconnects when the radio stops answering health checks', async () => {
    const { client, radio, transport } = await setupClient();
    const onDisconnect = vi.fn();
    client.on('disconnect', onDisconnect);
    radio.unresponsive = true;

    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL_MS + 5000);
    expect(onDisconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL_MS);
    expect(onDisconnect).toHaveBeenCalledWith(expect.objectContaining({ message: 'radio stopped responding' }));

    radio.unresponsive = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.status).toBe('ready');
    expect(transport.connectCount).toBe(2);
    expect(transport.written.filter((p) => p[0] === CommandCode.GetBattAndStorage).length).toBeGreaterThanOrEqual(2);
  });

  it('stops reconnecting after destroy', async () => {
    const { client, transport } = await setupClient();
    transport.simulateDisconnect();
    await client.destroy();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.connectCount).toBe(1);
    await flush();
  });
});
