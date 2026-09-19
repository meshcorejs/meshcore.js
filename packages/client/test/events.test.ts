import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { LoadError } from '../src/errors.js';
import { EventBuilder } from '../src/events/event-builder.js';
import type { Contact } from '../src/structures/contact.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EventBuilder', () => {
  it('types the handler from the event name', () => {
    new EventBuilder().setEvent('contactAdd').setHandler((_client, contact) => {
      expectTypeOf(contact).toEqualTypeOf<Contact>();
    });
    new EventBuilder().setEvent('reconnecting').setHandler((_client, attempt, delay) => {
      expectTypeOf(attempt).toEqualTypeOf<number>();
      expectTypeOf(delay).toEqualTypeOf<number>();
    });
  });

  it('requires an event and a handler', () => {
    expect(() => new EventBuilder().build()).toThrow(LoadError);
  });

  it('subscribes handlers with the client as first argument', async () => {
    const { client, radio } = await setupClient();
    const seen: string[] = [];
    client.register([
      new EventBuilder().setEvent('contactAdd').setHandler((c, contact) => {
        seen.push(`${c === client} ${contact.name}`);
      }),
      new EventBuilder().setEvent('contactAdd').setHandler((_c, contact) => {
        seen.push(`second ${contact.name}`);
      }),
    ]);
    radio.hearAdvert(fakeContactRecord({ name: 'Julie' }));
    await flush();
    expect(seen).toEqual(['true Julie', 'second Julie']);
    expect(client.events.size).toBe(2);
  });

  it('supports once', async () => {
    const { client, radio } = await setupClient();
    const handler = vi.fn();
    client.register(new EventBuilder().setEvent('contactAdd').setOnce().setHandler(handler));
    radio.hearAdvert(fakeContactRecord({ name: 'Julie' }));
    radio.hearAdvert(fakeContactRecord({ name: 'Marc' }));
    await flush();
    expect(handler).toHaveBeenCalledOnce();
    expect(client.events.size).toBe(0);
  });

  it('isolates sync and async handler errors', async () => {
    const { client, radio } = await setupClient();
    const onError = vi.fn();
    const after = vi.fn();
    client.on('error', onError);
    client.register([
      new EventBuilder().setEvent('contactAdd').setHandler(() => {
        throw new Error('sync');
      }),
      new EventBuilder().setEvent('contactAdd').setHandler(async () => {
        throw new Error('async');
      }),
      new EventBuilder().setEvent('contactAdd').setHandler(after),
    ]);
    radio.hearAdvert(fakeContactRecord({ name: 'Julie' }));
    await flush();
    expect(after).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(new Error('sync'), { type: 'event', name: 'contactAdd' });
    expect(onError).toHaveBeenCalledWith(new Error('async'), { type: 'event', name: 'contactAdd' });
  });
});
