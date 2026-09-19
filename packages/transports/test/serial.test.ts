import { EventEmitter } from 'node:events';
import { fromHex, toHex } from '@meshcorejs/protocol';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionError, MissingDependencyError } from '../src/errors.js';
import { type SerialPortLike, type SerialPortModule, SerialTransport } from '../src/serial.js';

class FakeSerialPort extends EventEmitter implements SerialPortLike {
  static instances: FakeSerialPort[] = [];
  static openError: Error | null = null;
  readonly written: Uint8Array[] = [];
  isOpen = false;

  constructor(readonly options: { path: string; baudRate: number; autoOpen: boolean }) {
    super();
    FakeSerialPort.instances.push(this);
  }

  open(callback: (error: Error | null) => void): void {
    const error = FakeSerialPort.openError;
    FakeSerialPort.openError = null;
    this.isOpen = error === null;
    queueMicrotask(() => callback(error));
  }

  write(data: Uint8Array, callback: (error: Error | null | undefined) => void): boolean {
    this.written.push(data);
    queueMicrotask(() => callback(null));
    return true;
  }

  close(callback: (error: Error | null) => void): void {
    this.isOpen = false;
    queueMicrotask(() => callback(null));
  }
}

const loadModule = async (): Promise<SerialPortModule> => ({ SerialPort: FakeSerialPort });

function lastPort(): FakeSerialPort {
  const port = FakeSerialPort.instances.at(-1);
  if (!port) throw new Error('no port created');
  return port;
}

describe('SerialTransport', () => {
  it('opens the port with the default baud rate and autoOpen disabled', async () => {
    const transport = new SerialTransport({ path: '/dev/ttyUSB0' }, { loadModule });
    await transport.connect();
    expect(lastPort().options).toEqual({ path: '/dev/ttyUSB0', baudRate: 115200, autoOpen: false });
    expect(transport.kind).toBe('serial');
    expect(transport.connected).toBe(true);
  });

  it("frames writes with '<' and decodes '>' frames from data events", async () => {
    const transport = new SerialTransport({ path: '/dev/ttyACM0', baudRate: 57600 }, { loadModule });
    await transport.connect();
    const frames: string[] = [];
    transport.on('frame', (payload) => frames.push(toHex(payload)));

    await transport.write(Uint8Array.of(0x0a));
    expect(toHex(lastPort().written[0]!)).toBe('3c01000a');

    lastPort().emit('data', fromHex('3e02'));
    lastPort().emit('data', fromHex('000a0b'));
    expect(frames).toEqual(['0a0b']);
  });

  it('wraps open failures in ConnectionError', async () => {
    FakeSerialPort.openError = new Error('Permission denied');
    const transport = new SerialTransport({ path: '/dev/ttyUSB9' }, { loadModule });
    await expect(transport.connect()).rejects.toThrow('cannot open serial port /dev/ttyUSB9: Permission denied');
    expect(transport.connected).toBe(false);
  });

  it('emits close when the device disappears', async () => {
    const transport = new SerialTransport({ path: '/dev/ttyUSB0' }, { loadModule });
    await transport.connect();
    const onClose = vi.fn();
    transport.on('close', onClose);
    lastPort().emit('close', new Error('Disconnected'));
    expect(onClose).toHaveBeenCalledWith(new Error('Disconnected'));
    expect(transport.connected).toBe(false);
  });

  it('does not emit close on a local close() and can reconnect', async () => {
    const transport = new SerialTransport({ path: '/dev/ttyUSB0' }, { loadModule });
    await transport.connect();
    const onClose = vi.fn();
    transport.on('close', onClose);
    const port = lastPort();
    await transport.close();
    port.emit('close');
    expect(onClose).not.toHaveBeenCalled();
    await transport.connect();
    expect(lastPort()).not.toBe(port);
  });

  it('rejects writes when not connected', async () => {
    const transport = new SerialTransport({ path: '/dev/ttyUSB0' }, { loadModule });
    await expect(transport.write(Uint8Array.of(1))).rejects.toBeInstanceOf(ConnectionError);
  });

  it('reports a missing serialport package', async () => {
    const transport = new SerialTransport(
      { path: '/dev/ttyUSB0' },
      {
        loadModule: () => Promise.reject(new MissingDependencyError('serialport')),
      },
    );
    await expect(transport.connect()).rejects.toBeInstanceOf(MissingDependencyError);
  });
});
