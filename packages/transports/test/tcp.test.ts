import { createServer, type Server, type Socket } from 'node:net';
import { fromHex, toHex } from '@meshcorejs/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionError } from '../src/errors.js';
import { TcpTransport } from '../src/tcp.js';

interface FakeRadioServer {
  server: Server;
  port: number;
  nextSocket(): Promise<Socket>;
  received: Buffer[];
}

async function startServer(): Promise<FakeRadioServer> {
  const received: Buffer[] = [];
  const waiting: Array<(socket: Socket) => void> = [];
  const server = createServer((socket) => {
    socket.on('data', (chunk) => received.push(chunk));
    waiting.shift()?.(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return {
    server,
    port: address.port,
    received,
    nextSocket: () => new Promise((resolve) => waiting.push(resolve)),
  };
}

const servers: Server[] = [];
const transports: TcpTransport[] = [];

async function setup() {
  const radio = await startServer();
  servers.push(radio.server);
  const transport = new TcpTransport({ host: '127.0.0.1', port: radio.port });
  transports.push(transport);
  const socketPromise = radio.nextSocket();
  await transport.connect();
  return { radio, transport, socket: await socketPromise };
}

afterEach(async () => {
  await Promise.all(transports.splice(0).map((t) => t.close()));
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

const waitFor = async (predicate: () => boolean) => vi.waitFor(() => expect(predicate()).toBe(true));

describe('TcpTransport', () => {
  it('uses port 5000 by default', () => {
    expect(new TcpTransport({ host: 'radio.local' }).port).toBe(5000);
  });

  it('connects and reports its state', async () => {
    const { transport } = await setup();
    expect(transport.kind).toBe('tcp');
    expect(transport.connected).toBe(true);
  });

  it("writes payloads framed with '<'", async () => {
    const { radio, transport } = await setup();
    await transport.write(Uint8Array.of(0x16, 0x03));
    await waitFor(() => radio.received.length > 0);
    expect(toHex(Buffer.concat(radio.received))).toBe('3c02001603');
  });

  it("emits payloads of '>' frames, even when split across packets", async () => {
    const { socket, transport } = await setup();
    const frames: string[] = [];
    transport.on('frame', (payload) => frames.push(toHex(payload)));
    socket.write(fromHex('3e0100'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.write(fromHex('00 3e01000a'));
    await waitFor(() => frames.length === 2);
    expect(frames).toEqual(['00', '0a']);
  });

  it('emits close with an error when the radio drops the connection', async () => {
    const { socket, transport } = await setup();
    const closed = new Promise<Error | undefined>((resolve) => transport.once('close', resolve));
    socket.destroy();
    expect(await closed).toBeInstanceOf(ConnectionError);
    expect(transport.connected).toBe(false);
  });

  it('does not emit close on a local close()', async () => {
    const { transport } = await setup();
    const onClose = vi.fn();
    transport.on('close', onClose);
    await transport.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onClose).not.toHaveBeenCalled();
    expect(transport.connected).toBe(false);
    await transport.close();
  });

  it('can connect again after being closed', async () => {
    const { radio, transport } = await setup();
    await transport.close();
    const socketPromise = radio.nextSocket();
    await transport.connect();
    await socketPromise;
    expect(transport.connected).toBe(true);
  });

  it('rejects writes when not connected', async () => {
    await expect(new TcpTransport({ host: '127.0.0.1' }).write(Uint8Array.of(1))).rejects.toBeInstanceOf(
      ConnectionError,
    );
  });

  it('rejects a second connect while connected', async () => {
    const { transport } = await setup();
    await expect(transport.connect()).rejects.toBeInstanceOf(ConnectionError);
  });

  it('wraps connection failures in ConnectionError', async () => {
    const radio = await startServer();
    const port = radio.port;
    await new Promise<void>((resolve) => radio.server.close(() => resolve()));
    const transport = new TcpTransport({ host: '127.0.0.1', port });
    await expect(transport.connect()).rejects.toThrow(/TCP connection to 127\.0\.0\.1:\d+ failed/);
    expect(transport.connected).toBe(false);
  });

  it('honours an aborted signal', async () => {
    const transport = new TcpTransport({ host: '127.0.0.1', port: 1 });
    const controller = new AbortController();
    controller.abort(new Error('stop'));
    await expect(transport.connect(controller.signal)).rejects.toThrow('stop');
  });
});
