import {
  type Channel,
  Client,
  type Contact,
  type RadioConfig,
  type Replies,
  SEND_INTERVAL_MS,
  silentLogger,
} from '@meshcorejs/client';
import type { ContactRecord, SelfInfo } from '@meshcorejs/protocol';
import { FakeRadio, type FakeRadioOptions, fakeContactRecord, MockTransport } from '@meshcorejs/transports/mock';
import { type Clock, withGlobal } from '@sinonjs/fake-timers';
import { parseDuration } from './duration.js';

export interface TestClientOptions {
  load?: string | URL;
  self?: Partial<SelfInfo>;
  now?: Date | string | number;
  maxChannels?: number;
  radio?: RadioConfig;
  replies?: Partial<Replies>;
  fakeRadio?: Omit<FakeRadioOptions, 'self' | 'clock'>;
}

export interface TestBot {
  readonly client: Client;
  readonly radio: FakeRadio;
  readonly transport: MockTransport;
  readonly clock: Clock;
  /**
   * @param name Contact name, the key is derived from it
   * @param overrides Contact record fields
   */
  fakeContact(name: string, overrides?: Partial<ContactRecord>): Contact;
  /**
   * @param name Channel name
   * @param secret 16 bytes, derived from the name when omitted
   */
  fakeChannel(name: string, secret?: Uint8Array): Channel;
  /**
   * @param role Role name
   * @param members Contacts or public keys
   */
  setRoleMembers(role: string, members: Array<Contact | string>): void;
  /**
   * @param from Contact or its name
   * @param text Message text
   */
  dm(from: Contact | string, text: string): Promise<string[]>;
  /**
   * @param channelName Channel name
   * @param authorName Sender name
   * @param text Message text
   */
  channel(channelName: string, authorName: string, text: string): Promise<string[]>;
  /** @param date New simulated time */
  setTime(date: Date | string | number): Promise<void>;
  /** @param duration Milliseconds, or a string like 30s, 5m, 1h, 1d */
  advanceTime(duration: string | number): Promise<void>;
  /** @param target Channel name, contact name or key prefix */
  sentTo(target: string): string[];
  destroy(): Promise<void>;
}

const IDLE_STEP_MS = 100;
const IDLE_MAX_MS = 5 * 60_000;

/** @param options load, self, now, maxChannels, radio, replies and fakeRadio */
export async function createTestClient(options: TestClientOptions = {}): Promise<TestBot> {
  const clock = withGlobal(globalThis).install({
    now: options.now === undefined ? Date.now() : new Date(options.now),
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'Date'],
  });

  const transport = new MockTransport();
  const radio = new FakeRadio({
    ...options.fakeRadio,
    self: { name: 'TestBot', ...options.self },
    device: { maxChannels: options.maxChannels ?? 8, ...options.fakeRadio?.device },
  }).attach(transport);
  const client = new Client({
    transport,
    logger: silentLogger,
    ...(options.load ? { load: options.load } : {}),
    ...(options.radio ? { radio: options.radio } : {}),
    ...(options.replies ? { replies: options.replies } : {}),
  });

  try {
    await client.login();
  } catch (error) {
    clock.uninstall();
    throw error;
  }

  const isIdle = () => client.sendQueue.idle && client.commands.inFlight === 0 && radio.pendingMessages === 0;

  const settle = async () => {
    await clock.tickAsync(0);
    for (let elapsed = 0; elapsed < IDLE_MAX_MS && !isIdle(); elapsed += IDLE_STEP_MS) {
      await clock.tickAsync(client.sendQueue.idle ? IDLE_STEP_MS : Math.min(SEND_INTERVAL_MS, IDLE_STEP_MS * 5));
    }
  };

  const collect = async (action: () => void) => {
    const start = radio.sent.length;
    action();
    await settle();
    return radio.sent.slice(start).map((message) => message.text);
  };

  const resolveContact = (contact: Contact | string): Contact => {
    if (typeof contact !== 'string') return contact;
    const found = client.contacts.get(contact) ?? client.contacts.cache.find((c) => c.name === contact);
    if (!found) throw new Error(`unknown contact "${contact}", create it with fakeContact()`);
    return found;
  };

  const bot: TestBot = {
    client,
    radio,
    transport,
    clock,

    fakeContact(name, overrides = {}) {
      const record = fakeContactRecord({ name, lastModified: radio.clock, ...overrides });
      radio.contacts.set(record.publicKey, record);
      return client.contacts._patchFromRadio(record, record.publicKey) as Contact;
    },

    fakeChannel(name, secret) {
      const existing = client.channels.get(name);
      if (existing) return existing;
      const index = radio.channels.indexOf(null);
      if (index === -1) throw new Error('no free channel slot on the fake radio');
      const record = {
        index,
        name,
        secret: secret ?? new Uint8Array(new TextEncoder().encode(name.padEnd(16, '\0')).subarray(0, 16)),
      };
      radio.channels[index] = record;
      client.channels._apply(index, record, true);
      return client.channels.get(index) as Channel;
    },

    setRoleMembers(roleName, members) {
      const role = client.roles.get(roleName);
      if (!role) throw new Error(`unknown role "${roleName}"`);
      role._overrideMembers(
        members.map((member) => ({ key: typeof member === 'string' ? member.toLowerCase() : member.publicKey })),
      );
    },

    dm(from, text) {
      const contact = resolveContact(from);
      return collect(() => radio.receiveContactMessage({ from: contact.publicKey, text }));
    },

    channel(channelName, authorName, text) {
      const channel = bot.fakeChannel(channelName);
      return collect(() => radio.receiveChannelMessage({ channelIndex: channel.index, senderName: authorName, text }));
    },

    async setTime(date) {
      client.jobs.stop();
      clock.setSystemTime(new Date(date));
      client.jobs.start();
      await settle();
    },

    async advanceTime(duration) {
      await clock.tickAsync(parseDuration(duration));
      await settle();
    },

    sentTo(target) {
      return radio.sent
        .filter((message) =>
          message.kind === 'channel'
            ? message.channelName.toLowerCase() === target.toLowerCase()
            : message.contact.name === target || message.contact.publicKey.startsWith(target.toLowerCase()),
        )
        .map((message) => message.text);
    },

    async destroy() {
      const destroyed = client.destroy();
      await clock.tickAsync(10_000);
      await destroyed;
      clock.uninstall();
    },
  };
  return bot;
}
