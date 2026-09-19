import type { DecodedFrame } from '@meshcorejs/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandTimeoutError, RadioError } from '../src/errors.js';
import { RequestQueue } from '../src/radio/request-queue.js';

const ok: DecodedFrame = { kind: 'response', type: 'ok' };
const isOk = (frame: DecodedFrame) => (frame.type === 'ok' ? { value: 'done' } : ('ignore' as const));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RequestQueue', () => {
  it('writes one request at a time, in order', async () => {
    const written: number[] = [];
    const queue = new RequestQueue(async (payload) => {
      written.push(payload[0]!);
    });
    const first = queue.request('FIRST', Uint8Array.of(1), isOk);
    const second = queue.request('SECOND', Uint8Array.of(2), isOk);
    await vi.advanceTimersByTimeAsync(0);
    expect(written).toEqual([1]);
    expect(queue.size).toBe(2);

    expect(queue.handleResponse(ok)).toBe(true);
    await expect(first).resolves.toBe('done');
    await vi.advanceTimersByTimeAsync(0);
    expect(written).toEqual([1, 2]);
    queue.handleResponse(ok);
    await expect(second).resolves.toBe('done');
    expect(queue.size).toBe(0);
  });

  it('ignores frames nobody is waiting for', () => {
    const queue = new RequestQueue(async () => {});
    expect(queue.handleResponse(ok)).toBe(false);
  });

  it('rejects with RadioError on ERR and DISABLED', async () => {
    const queue = new RequestQueue(async () => {});
    const failing = queue.request('REMOVE_CONTACT', Uint8Array.of(15), isOk);
    queue.handleResponse({ kind: 'response', type: 'err', errorCode: 2 });
    await expect(failing).rejects.toThrow('radio rejected REMOVE_CONTACT: not found');

    const disabled = queue.request('EXPORT', Uint8Array.of(17), isOk);
    queue.handleResponse({ kind: 'response', type: 'disabled' });
    await expect(disabled).rejects.toBeInstanceOf(RadioError);
  });

  it('times out after 5 s without an answer and moves on', async () => {
    const queue = new RequestQueue(async () => {});
    const stuck = queue.request('APP_START', Uint8Array.of(1), isOk);
    const next = queue.request('DEVICE_QUERY', Uint8Array.of(22), isOk);
    const assertion = expect(stuck).rejects.toBeInstanceOf(CommandTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    queue.handleResponse(ok);
    await expect(next).resolves.toBe('done');
  });

  it('restarts the timeout on partial answers', async () => {
    const queue = new RequestQueue(async () => {});
    let parts = 0;
    const list = queue.request('GET_CONTACTS', Uint8Array.of(4), (frame) => {
      if (frame.type !== 'ok') return 'ignore';
      parts++;
      return parts === 3 ? { value: parts } : 'continue';
    });
    await vi.advanceTimersByTimeAsync(4000);
    queue.handleResponse(ok);
    await vi.advanceTimersByTimeAsync(4000);
    queue.handleResponse(ok);
    await vi.advanceTimersByTimeAsync(4000);
    queue.handleResponse(ok);
    await expect(list).resolves.toBe(3);
  });

  it('rejects when the write fails', async () => {
    const queue = new RequestQueue(async () => {
      throw new Error('socket closed');
    });
    await expect(queue.request('APP_START', Uint8Array.of(1), isOk)).rejects.toThrow('socket closed');
  });

  it('rejectAll fails the active and waiting requests', async () => {
    const queue = new RequestQueue(async () => {});
    const a = queue.request('A', Uint8Array.of(1), isOk);
    const b = queue.request('B', Uint8Array.of(2), isOk);
    queue.rejectAll(new Error('disconnected'));
    await expect(a).rejects.toThrow('disconnected');
    await expect(b).rejects.toThrow('disconnected');
    expect(queue.size).toBe(0);
  });
});
