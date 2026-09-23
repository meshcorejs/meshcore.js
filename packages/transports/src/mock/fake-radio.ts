import {
  ByteReader,
  CHANNEL_SECRET_SIZE,
  type ChannelRecord,
  CommandCode,
  type ContactRecord,
  type DeviceInfo,
  encodeAdvertPush,
  encodeBattAndStorageResponse,
  encodeChannelInfoResponse,
  encodeChannelMessageResponse,
  encodeContactDeletedPush,
  encodeContactMessageResponse,
  encodeContactResponse,
  encodeContactsFullPush,
  encodeContactsStartResponse,
  encodeCurrentTimeResponse,
  encodeDeviceInfoResponse,
  encodeEndOfContactsResponse,
  encodeErrResponse,
  encodeExportContactResponse,
  encodeMsgWaitingPush,
  encodeNewAdvertPush,
  encodeNoMoreMessagesResponse,
  encodeOkResponse,
  encodePathUpdatedPush,
  encodeSelfInfoResponse,
  encodeSendConfirmedPush,
  encodeSentResponse,
  MAX_TEXT_LEN,
  NAME_FIELD_SIZE,
  PUB_KEY_PREFIX_SIZE,
  PUB_KEY_SIZE,
  RadioErrorCode,
  type SelfInfo,
  TxtType,
  toHex,
} from '@meshcorejs/protocol';
import type { MockTransport } from './mock-transport.js';

/** Initial state of a `FakeRadio`: self info, device info, contacts, channels, clock, the ack timeout it suggests and its own advert packet. */
export interface FakeRadioOptions {
  self?: Partial<SelfInfo>;
  device?: Partial<DeviceInfo>;
  contacts?: ContactRecord[];
  channels?: Array<{ index: number; name: string; secret: Uint8Array }>;
  clock?: number;
  suggestedTimeoutMs?: number;
  selfAdvertPacket?: Uint8Array;
}

/** How {@link FakeRadio} acknowledges direct messages: `auto` right away, `manual` on `ack()`, `never`. */
export type AckMode = 'auto' | 'manual' | 'never';

/** A direct message {@link FakeRadio} recorded as sent by the app. */
export interface FakeSentDirectMessage {
  kind: 'dm';
  recipientPrefix: string;
  contact: ContactRecord;
  text: string;
  attempt: number;
  timestamp: number;
  flood: boolean;
  expectedAck: number;
}

/** A channel message {@link FakeRadio} recorded as sent by the app. */
export interface FakeSentChannelMessage {
  kind: 'channel';
  channelIndex: number;
  channelName: string;
  text: string;
  wireText: string;
  timestamp: number;
}

/** One message {@link FakeRadio} recorded as sent by the app, direct or on a channel. */
export type FakeSentMessage = FakeSentDirectMessage | FakeSentChannelMessage;

const DEFAULT_PUBLIC_KEY = 'b0'.repeat(PUB_KEY_SIZE);

function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  return new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/�$/, '');
}

/**
 * Emulates the Companion firmware (`FIRMWARE_VER_CODE` 13) for the v1 command subset, attached to a
 * {@link MockTransport}. Used by `@meshcorejs/testing` and every test that needs a radio without hardware.
 */
export class FakeRadio {
  readonly self: SelfInfo;
  readonly device: DeviceInfo;
  readonly contacts = new Map<string, ContactRecord>();
  readonly channels: Array<ChannelRecord | null>;
  readonly sent: FakeSentMessage[] = [];
  readonly commands: number[] = [];
  appTargetVersion = 0;
  ackMode: AckMode = 'auto';
  ackDelayMs = 50;
  unresponsive = false;
  refuseSelfAdvert = false;
  batteryMillivolts = 4100;
  suggestedTimeoutMs: number;
  selfAdvertPacket: Uint8Array;
  readonly #offlineQueue: Uint8Array[] = [];
  #transport: MockTransport | null = null;
  #clockOffset: number;
  #nextAck = 0x1000;

  /** @param options Initial self, device, contacts, channels and clock */
  constructor(options: FakeRadioOptions = {}) {
    this.self = {
      advertType: 1,
      txPowerDbm: 22,
      maxTxPowerDbm: 22,
      publicKey: DEFAULT_PUBLIC_KEY,
      latitude: 0,
      longitude: 0,
      multiAcks: 0,
      advertLocationPolicy: 0,
      telemetryModes: { base: 0, location: 0, environment: 0 },
      manualAddContacts: false,
      radio: { frequencyKhz: 869525, bandwidthHz: 250000, spreadingFactor: 11, codingRate: 5 },
      name: 'FakeRadio',
      ...options.self,
    };
    this.device = {
      firmwareVersion: 13,
      maxContacts: 100,
      maxChannels: 8,
      blePin: 123456,
      firmwareBuildDate: '24 Aug 2026',
      manufacturer: 'FakeRadio',
      firmwareVersionName: 'v1.9.0',
      repeatEnabled: false,
      pathHashMode: 0,
      ...options.device,
    };
    for (const contact of options.contacts ?? []) this.contacts.set(contact.publicKey, { ...contact });
    this.channels = Array.from({ length: this.device.maxChannels ?? 8 }, () => null);
    for (const channel of options.channels ?? []) this.channels[channel.index] = { ...channel };
    this.#clockOffset = (options.clock ?? Math.floor(Date.now() / 1000)) - Math.floor(Date.now() / 1000);
    this.suggestedTimeoutMs = options.suggestedTimeoutMs ?? 3000;
    this.selfAdvertPacket = options.selfAdvertPacket ?? Uint8Array.from([0x10, 0x11, 0x12, 0x13]);
  }

  get clock(): number {
    return Math.floor(Date.now() / 1000) + this.#clockOffset;
  }

  /** @param transport MockTransport this radio answers */
  attach(transport: MockTransport): this {
    this.#transport = transport;
    transport.setRadio((payload) => this.#handle(payload));
    return this;
  }

  /** @param params from, text, and optional snr, hops and senderTimestamp */
  receiveContactMessage(params: {
    from: string;
    text: string;
    snr?: number;
    hops?: number;
    senderTimestamp?: number;
  }): void {
    const contact = this.#findByPrefix(params.from);
    if (!contact) throw new Error(`FakeRadio: unknown contact ${params.from}`);
    this.#queueMessage(
      encodeContactMessageResponse({
        version: this.appTargetVersion >= 3 ? 3 : 2,
        snr: params.snr ?? 6,
        senderPrefix: contact.publicKey.slice(0, PUB_KEY_PREFIX_SIZE * 2),
        pathLen: params.hops ?? 0xff,
        txtType: TxtType.Plain,
        senderTimestamp: params.senderTimestamp ?? this.clock,
        signature: null,
        text: params.text,
      }),
    );
  }

  /** @param params channelIndex, senderName, text, and optional snr and hops */
  receiveChannelMessage(params: {
    channelIndex: number;
    senderName: string;
    text: string;
    snr?: number;
    hops?: number;
    senderTimestamp?: number;
  }): void {
    this.#queueMessage(
      encodeChannelMessageResponse({
        version: this.appTargetVersion >= 3 ? 3 : 2,
        snr: params.snr ?? 6,
        channelIndex: params.channelIndex,
        pathLen: params.hops ?? 0,
        txtType: TxtType.Plain,
        senderTimestamp: params.senderTimestamp ?? this.clock,
        text: `${params.senderName}: ${params.text}`,
      }),
    );
  }

  /** @param contact Record of the node heard */
  hearAdvert(contact: ContactRecord): void {
    const record = { ...contact, lastModified: this.clock };
    const known = this.contacts.has(contact.publicKey);
    const full = this.contacts.size >= (this.device.maxContacts ?? 100);
    if (!known && (this.self.manualAddContacts || full)) {
      this.#push(encodeNewAdvertPush(record));
      if (full && !this.self.manualAddContacts) this.#push(encodeContactsFullPush());
      return;
    }
    this.contacts.set(contact.publicKey, record);
    this.#push(encodeAdvertPush(contact.publicKey));
  }

  /**
   * @param publicKey Contact key
   * @param outPath New path, null for flood
   */
  updatePath(publicKey: string, outPath: ContactRecord['outPath']): void {
    const contact = this.contacts.get(publicKey);
    if (!contact) throw new Error(`FakeRadio: unknown contact ${publicKey}`);
    contact.outPath = outPath;
    contact.lastModified = this.clock;
    this.#push(encodePathUpdatedPush(publicKey));
  }

  /** @param publicKey Contact key */
  deleteContact(publicKey: string): void {
    this.contacts.delete(publicKey);
    this.#push(encodeContactDeletedPush(publicKey));
  }

  /**
   * @param expectedAck Value announced by SENT
   * @param roundTripMs Delay reported in the ACK. Default 1200
   */
  ack(expectedAck: number, roundTripMs = 1200): void {
    this.#push(encodeSendConfirmedPush({ ack: expectedAck, roundTripMs }));
  }

  get pendingMessages(): number {
    return this.#offlineQueue.length;
  }

  #handle(payload: Uint8Array): void {
    const code = payload[0];
    if (code === undefined || this.unresponsive) return;
    this.commands.push(code);
    const r = new ByteReader(payload.subarray(1));
    try {
      this.#dispatch(code, r, payload.length);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.#reply(encodeErrResponse(RadioErrorCode.IllegalArg));
    }
  }

  #dispatch(code: number, r: ByteReader, length: number): void {
    switch (code) {
      case CommandCode.AppStart:
        if (length < 8) return this.#reply(encodeErrResponse(RadioErrorCode.IllegalArg));
        return this.#reply(encodeSelfInfoResponse(this.self));

      case CommandCode.DeviceQuery:
        this.appTargetVersion = r.u8();
        return this.#reply(encodeDeviceInfoResponse(this.device));

      case CommandCode.GetContacts: {
        const since = r.remaining >= 4 ? r.u32() : 0;
        const all = [...this.contacts.values()];
        this.#reply(encodeContactsStartResponse(all.length));
        let mostRecent = 0;
        for (const contact of all) {
          if (contact.lastModified <= since) continue;
          this.#reply(encodeContactResponse(contact));
          mostRecent = Math.max(mostRecent, contact.lastModified);
        }
        return this.#reply(encodeEndOfContactsResponse(mostRecent));
      }

      case CommandCode.GetDeviceTime:
        return this.#reply(encodeCurrentTimeResponse(this.clock));

      case CommandCode.SetDeviceTime: {
        const seconds = r.u32();
        if (seconds < this.clock) return this.#reply(encodeErrResponse(RadioErrorCode.IllegalArg));
        this.#clockOffset += seconds - this.clock;
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.SendSelfAdvert:
        if (this.refuseSelfAdvert) return this.#reply(encodeErrResponse(RadioErrorCode.BadState));
        return this.#reply(encodeOkResponse());

      case CommandCode.AddUpdateContact: {
        const publicKey = toHex(r.bytes(PUB_KEY_SIZE));
        const type = r.u8();
        const flags = r.u8();
        r.skip(1 + 64);
        const name = r.fixedString(NAME_FIELD_SIZE);
        const lastAdvertTimestamp = r.u32();
        const existing = this.contacts.get(publicKey);
        if (!existing && this.contacts.size >= (this.device.maxContacts ?? 100)) {
          return this.#reply(encodeErrResponse(RadioErrorCode.TableFull));
        }
        this.contacts.set(publicKey, {
          publicKey,
          type,
          flags,
          outPath: existing?.outPath ?? null,
          name,
          lastAdvertTimestamp,
          latitude: existing?.latitude ?? 0,
          longitude: existing?.longitude ?? 0,
          lastModified: this.clock,
        });
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.SyncNextMessage:
        return this.#reply(this.#offlineQueue.shift() ?? encodeNoMoreMessagesResponse());

      case CommandCode.ResetPath:
      case CommandCode.RemoveContact:
      case CommandCode.GetContactByKey: {
        const publicKey = toHex(r.bytes(PUB_KEY_SIZE));
        const contact = this.contacts.get(publicKey);
        if (!contact) return this.#reply(encodeErrResponse(RadioErrorCode.NotFound));
        if (code === CommandCode.GetContactByKey) return this.#reply(encodeContactResponse(contact));
        if (code === CommandCode.ResetPath) contact.outPath = null;
        else this.contacts.delete(publicKey);
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.ExportContact:
        return this.#reply(encodeExportContactResponse(this.selfAdvertPacket));

      case CommandCode.GetBattAndStorage:
        return this.#reply(
          encodeBattAndStorageResponse({
            batteryMillivolts: this.batteryMillivolts,
            storageUsedKb: 64,
            storageTotalKb: 1024,
          }),
        );

      case CommandCode.GetChannel: {
        const index = r.u8();
        if (index >= this.channels.length) return this.#reply(encodeErrResponse(RadioErrorCode.NotFound));
        const channel = this.channels[index] ?? { index, name: '', secret: new Uint8Array(CHANNEL_SECRET_SIZE) };
        return this.#reply(encodeChannelInfoResponse(channel));
      }

      case CommandCode.SetChannel: {
        const index = r.u8();
        const name = r.fixedString(NAME_FIELD_SIZE);
        const secret = r.bytes(CHANNEL_SECRET_SIZE);
        if (index >= this.channels.length) return this.#reply(encodeErrResponse(RadioErrorCode.NotFound));
        this.channels[index] = name === '' ? null : { index, name, secret };
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.SendTxtMsg: {
        const txtType = r.u8();
        const attempt = r.u8();
        const timestamp = r.u32();
        const recipientPrefix = toHex(r.bytes(PUB_KEY_PREFIX_SIZE));
        const text = r.restString();
        const contact = this.#findByPrefix(recipientPrefix);
        if (!contact) return this.#reply(encodeErrResponse(RadioErrorCode.NotFound));
        if (txtType !== TxtType.Plain) return this.#reply(encodeErrResponse(RadioErrorCode.UnsupportedCmd));
        const expectedAck = this.#nextAck++;
        const flood = contact.outPath === null;
        this.sent.push({ kind: 'dm', recipientPrefix, contact, text, attempt, timestamp, flood, expectedAck });
        this.#reply(encodeSentResponse({ flood, expectedAck, suggestedTimeoutMs: this.suggestedTimeoutMs }));
        if (this.ackMode === 'auto') setTimeout(() => this.ack(expectedAck), this.ackDelayMs);
        return;
      }

      case CommandCode.SendChannelTxtMsg: {
        const txtType = r.u8();
        const channelIndex = r.u8();
        const timestamp = r.u32();
        const text = r.restString();
        const channel = this.channels[channelIndex];
        if (txtType !== TxtType.Plain) return this.#reply(encodeErrResponse(RadioErrorCode.UnsupportedCmd));
        if (!channel) return this.#reply(encodeErrResponse(RadioErrorCode.NotFound));
        const wireText = truncateUtf8(`${this.self.name}: ${text}`, MAX_TEXT_LEN);
        this.sent.push({ kind: 'channel', channelIndex, channelName: channel.name, text, wireText, timestamp });
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.SetAdvertName: {
        const name = r.restString();
        if (name.length === 0 || new TextEncoder().encode(name).length > NAME_FIELD_SIZE - 1) {
          return this.#reply(encodeErrResponse(RadioErrorCode.IllegalArg));
        }
        this.self.name = name;
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.SetAdvertLatLon: {
        const lat = r.i32();
        const lon = r.i32();
        if (Math.abs(lat) > 90_000_000 || Math.abs(lon) > 180_000_000) {
          return this.#reply(encodeErrResponse(RadioErrorCode.IllegalArg));
        }
        this.self.latitude = lat / 1_000_000;
        this.self.longitude = lon / 1_000_000;
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.SetRadioTxPower: {
        const dbm = r.i8();
        if (dbm < -9 || dbm > this.self.maxTxPowerDbm) return this.#reply(encodeErrResponse(RadioErrorCode.IllegalArg));
        this.self.txPowerDbm = dbm;
        return this.#reply(encodeOkResponse());
      }

      case CommandCode.SetRadioParams: {
        const frequencyKhz = r.u32();
        const bandwidthHz = r.u32();
        const spreadingFactor = r.u8();
        const codingRate = r.u8();
        const repeat = r.remaining >= 1 ? r.u8() !== 0 : undefined;
        const valid =
          frequencyKhz >= 150_000 &&
          frequencyKhz <= 2_500_000 &&
          bandwidthHz >= 7_000 &&
          bandwidthHz <= 500_000 &&
          spreadingFactor >= 5 &&
          spreadingFactor <= 12 &&
          codingRate >= 5 &&
          codingRate <= 8;
        if (!valid) return this.#reply(encodeErrResponse(RadioErrorCode.IllegalArg));
        this.self.radio = { frequencyKhz, bandwidthHz, spreadingFactor, codingRate };
        if (repeat !== undefined) this.device.repeatEnabled = repeat;
        return this.#reply(encodeOkResponse());
      }

      default:
        return this.#reply(encodeErrResponse(RadioErrorCode.UnsupportedCmd));
    }
  }

  #findByPrefix(keyOrPrefix: string): ContactRecord | undefined {
    const prefix = keyOrPrefix.toLowerCase();
    for (const contact of this.contacts.values()) {
      if (contact.publicKey.startsWith(prefix)) return contact;
    }
    return undefined;
  }

  #queueMessage(frame: Uint8Array): void {
    this.#offlineQueue.push(frame);
    this.#push(encodeMsgWaitingPush());
  }

  #reply(frame: Uint8Array): void {
    this.#transport?.receive(frame);
  }

  #push(frame: Uint8Array): void {
    if (this.#transport?.connected) this.#transport.receive(frame);
  }
}

/**
 * A `ContactRecord` for tests: the public key is derived from the name, every other field has a plausible default.
 * @param overrides name is required, the key is derived from it
 */
export function fakeContactRecord(overrides: Partial<ContactRecord> & { name: string }): ContactRecord {
  let state = 0x811c9dc5;
  for (const char of overrides.name) state = Math.imul(state ^ char.charCodeAt(0), 0x01000193) >>> 0;
  let publicKey = '';
  for (let i = 0; i < PUB_KEY_SIZE; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    publicKey += (state >>> 24).toString(16).padStart(2, '0');
  }
  return {
    publicKey,
    type: 1,
    flags: 0,
    outPath: null,
    lastAdvertTimestamp: 1_760_000_000,
    latitude: 0,
    longitude: 0,
    lastModified: 1_760_000_000,
    ...overrides,
  };
}
