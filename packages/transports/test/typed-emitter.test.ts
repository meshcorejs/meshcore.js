import { describe, expect, it, vi } from 'vitest';
import { TypedEmitter } from '../src/typed-emitter.js';

type Events = { ping: [count: number]; done: [] };

describe('TypedEmitter', () => {
  it('delivers typed arguments to listeners', () => {
    const emitter = new TypedEmitter<Events>();
    const listener = vi.fn();
    emitter.on('ping', listener);
    expect(emitter.emit('ping', 3)).toBe(true);
    expect(listener).toHaveBeenCalledWith(3);
  });

  it('supports once, off and listenerCount', () => {
    const emitter = new TypedEmitter<Events>();
    const once = vi.fn();
    const always = vi.fn();
    emitter.once('done', once).on('done', always);
    emitter.emit('done');
    emitter.emit('done');
    expect(once).toHaveBeenCalledTimes(1);
    expect(always).toHaveBeenCalledTimes(2);
    emitter.off('done', always);
    expect(emitter.listenerCount('done')).toBe(0);
    expect(emitter.emit('done')).toBe(false);
  });

  it('removes all listeners', () => {
    const emitter = new TypedEmitter<Events>();
    emitter.on('ping', () => {}).on('done', () => {});
    emitter.removeAllListeners('ping');
    expect(emitter.listenerCount('ping')).toBe(0);
    expect(emitter.listenerCount('done')).toBe(1);
    emitter.removeAllListeners();
    expect(emitter.listenerCount('done')).toBe(0);
  });
});
