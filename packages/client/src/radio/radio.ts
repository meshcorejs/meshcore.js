import {
  type BattAndStorageFrame,
  type ChannelMessageFrame,
  type ChannelRecord,
  CommandCode,
  type ContactMessageFrame,
  type ContactRecord,
  contactUri,
  type DecodedFrame,
  type DeviceInfo,
  decodeFrame,
  encodeAppStart,
  encodeDeviceQuery,
  encodeExportContact,
  encodeGetBattAndStorage,
  encodeGetChannel,
  encodeGetContactByKey,
  encodeGetContacts,
  encodeRemoveContact,
  encodeResetPath,
  encodeSendChannelTxtMsg,
  encodeSendSelfAdvert,
  encodeSendTxtMsg,
  encodeSetAdvertLatLon,
  encodeSetAdvertName,
  encodeSetChannel,
  encodeSetDeviceTime,
  encodeSetRadioParams,
  encodeSetRadioTxPower,
  encodeSyncNextMessage,
  type PushFrame,
  RadioErrorCode,
  type SelfInfo,
  type SendChannelTxtMsgParams,
  type SendTxtMsgParams,
  type SentFrame,
  type SetChannelParams,
} from '@meshcorejs/protocol';
import { type Transport, TypedEmitter } from '@meshcorejs/transports';
import { GuardedCommandError, RadioError, RateLimitError } from '../errors.js';
import {
  assertLocation,
  assertRadioName,
  assertRadioParams,
  assertTxPower,
  type Location,
  type RadioParams,
  toWireParams,
} from './radio-settings.js';
import { type Collector, RequestQueue } from './request-queue.js';

/** Events a `Radio` emits: `push` for unsolicited firmware pushes, `raw` for every decoded frame. */
export interface RadioEvents extends Record<string, unknown[]> {
  push: [frame: PushFrame];
  raw: [frame: DecodedFrame];
}

/** Options for `Radio`: request timeout. Default `timeoutMs` 5000. */
export interface RadioOptions {
  timeoutMs?: number;
}

/**
 * A `Collector` that resolves on the first response frame of `type`, mapped by `map`, and ignores the rest.
 * For `client.radio.request()` on commands whose answer is a structured frame.
 * @param type Response frame type (`DecodedFrame['type']`)
 * @param map Turns that frame into the request's result
 */
export function expectType<T extends DecodedFrame['type'], R>(
  type: T,
  map: (frame: Extract<DecodedFrame, { type: T }>) => R,
): Collector<R> {
  return (frame) => (frame.type === type ? { value: map(frame as Extract<DecodedFrame, { type: T }>) } : 'ignore');
}

const ok: Collector<void> = expectType('ok', () => undefined);

/** The Companion commands that put a packet on the air; `request()` refuses them. */
const GUARDED_COMMANDS: ReadonlySet<number> = new Set([
  CommandCode.SendTxtMsg,
  CommandCode.SendChannelTxtMsg,
  CommandCode.SendSelfAdvert,
]);

function commandLabel(code: number): string {
  const name = Object.entries(CommandCode).find(([, value]) => value === code)?.[0];
  return name ?? `CMD_0x${code.toString(16)}`;
}

const isNotFound = (error: unknown) => error instanceof RadioError && error.radioCode === RadioErrorCode.NotFound;

/** Minimum delay between two flood adverts (`sendSelfAdvert(true)`), not configurable. Zero-hop adverts are free. */
export const ADVERT_FLOOD_INTERVAL_MS = 30 * 60_000;

/**
 * `client.radio`: typed wrappers around the Companion commands (`appStart`, `deviceQuery`, `getContacts`,
 * `sendText`, …), one request in flight at a time.
 */
export class Radio extends TypedEmitter<RadioEvents> {
  readonly #queue: RequestQueue;
  #lastFloodAdvertAt = Number.NEGATIVE_INFINITY;

  /**
   * @param transport Connected or not, the radio only writes frames
   * @param options timeoutMs per request. Default 5000
   */
  constructor(transport: Transport, options: RadioOptions = {}) {
    super();
    this.#queue = new RequestQueue((payload) => transport.write(payload), options.timeoutMs);
    transport.on('frame', (payload) => this.#onFrame(payload));
  }

  /** @param error Rejects every pending request with it */
  reset(error: Error): void {
    this.#queue.rejectAll(error);
  }

  /**
   * Send a Companion command that has no typed wrapper, through the same one-request-in-flight queue as the
   * wrappers. Never write raw frames to `client.transport`. The three commands that transmit on the mesh are
   * refused with `GuardedCommandError`.
   * @param code Companion command code (`CommandCode.*`, or a byte the protocol does not know yet)
   * @param payload Command body without the code byte. Default empty
   * @param collect Turns response frames into the result. Default: expects `Ok`
   */
  async request<T = void>(
    code: number,
    payload: Uint8Array = new Uint8Array(0),
    collect: Collector<T> = ok as Collector<T>,
  ): Promise<T> {
    if (!Number.isInteger(code) || code < 0 || code > 0xff)
      throw new RangeError(`command code must be a byte, got ${code}`);
    if (GUARDED_COMMANDS.has(code)) throw new GuardedCommandError(code);
    const frame = new Uint8Array(payload.length + 1);
    frame[0] = code;
    frame.set(payload, 1);
    return this.#queue.request(commandLabel(code), frame, collect);
  }

  #onFrame(payload: Uint8Array): void {
    const frame = decodeFrame(payload);
    this.emit('raw', frame);
    if (frame.kind === 'push' && frame.type !== 'unknown' && frame.type !== 'malformed') {
      this.emit('push', frame);
      return;
    }
    this.#queue.handleResponse(frame);
  }

  /** @param appName Name announced to the radio */
  appStart(appName: string): Promise<SelfInfo> {
    return this.#queue.request(
      'APP_START',
      encodeAppStart(appName),
      expectType('selfInfo', (f) => f.selfInfo),
    );
  }

  deviceQuery(): Promise<DeviceInfo> {
    return this.#queue.request(
      'DEVICE_QUERY',
      encodeDeviceQuery(),
      expectType('deviceInfo', (f) => f.deviceInfo),
    );
  }

  /** @param epochSeconds Current time in seconds */
  async setDeviceTime(epochSeconds: number): Promise<void> {
    try {
      await this.#queue.request('SET_DEVICE_TIME', encodeSetDeviceTime(epochSeconds), ok);
    } catch (error) {
      if (error instanceof RadioError && error.radioCode === RadioErrorCode.IllegalArg) return;
      throw error;
    }
  }

  /** @param since Only contacts modified after this epoch */
  getContacts(since?: number): Promise<ContactRecord[]> {
    const contacts: ContactRecord[] = [];
    let started = false;
    return this.#queue.request('GET_CONTACTS', encodeGetContacts(since), (frame) => {
      if (frame.type === 'contactsStart') {
        started = true;
        return 'continue';
      }
      if (started && frame.type === 'contact') {
        contacts.push(frame.contact);
        return 'continue';
      }
      if (started && frame.type === 'endOfContacts') return { value: contacts };
      return 'ignore';
    });
  }

  /** @param publicKey Full public key in hex */
  async getContactByKey(publicKey: string): Promise<ContactRecord | null> {
    try {
      return await this.#queue.request(
        'GET_CONTACT_BY_KEY',
        encodeGetContactByKey(publicKey),
        expectType('contact', (f) => f.contact),
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** @param publicKey Full public key in hex */
  removeContact(publicKey: string): Promise<void> {
    return this.#queue.request('REMOVE_CONTACT', encodeRemoveContact(publicKey), ok);
  }

  /** @param publicKey Full public key in hex */
  resetPath(publicKey: string): Promise<void> {
    return this.#queue.request('RESET_PATH', encodeResetPath(publicKey), ok);
  }

  /** @param index Channel slot */
  async getChannel(index: number): Promise<ChannelRecord | null> {
    try {
      return await this.#queue.request(
        'GET_CHANNEL',
        encodeGetChannel(index),
        expectType('channelInfo', (f) => f.channel),
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** @param params Slot, name and secret */
  setChannel(params: SetChannelParams): Promise<void> {
    return this.#queue.request('SET_CHANNEL', encodeSetChannel(params), ok);
  }

  syncNextMessage(): Promise<ContactMessageFrame | ChannelMessageFrame | null> {
    return this.#queue.request('SYNC_NEXT_MESSAGE', encodeSyncNextMessage(), (frame) => {
      if (frame.type === 'noMoreMessages') return { value: null };
      if (frame.type === 'contactMessage' || frame.type === 'channelMessage') return { value: frame };
      return 'ignore';
    });
  }

  getBattAndStorage(): Promise<BattAndStorageFrame> {
    return this.#queue.request(
      'GET_BATT_AND_STORAGE',
      encodeGetBattAndStorage(),
      expectType('battAndStorage', (f) => f),
    );
  }

  async exportSelfContact(): Promise<{ packet: Uint8Array; uri: string }> {
    const packet = await this.#queue.request(
      'EXPORT_CONTACT',
      encodeExportContact(),
      expectType('exportContact', (f) => f.packet),
    );
    return { packet, uri: contactUri(packet) };
  }

  /**
   * @param flood Flood the mesh instead of a zero-hop advert; at most one flood per `ADVERT_FLOOD_INTERVAL_MS`
   * (`RateLimitError` otherwise), the window is reserved before the request so two concurrent calls cannot both
   * pass, and released again only when the failure proves nothing was transmitted (a `RadioError`, i.e. the
   * firmware answered `Err`). Any other failure, notably a `CommandTimeoutError`, keeps the window consumed:
   * a lost reply does not mean the flood never went out, and the reconnect loop retries `login()` on its own.
   */
  async sendSelfAdvert(flood: boolean): Promise<void> {
    if (!flood) {
      await this.#queue.request('SEND_SELF_ADVERT', encodeSendSelfAdvert({ flood }), ok);
      return;
    }
    const elapsed = Date.now() - this.#lastFloodAdvertAt;
    if (elapsed < ADVERT_FLOOD_INTERVAL_MS) {
      throw new RateLimitError('advert', null, 1, ADVERT_FLOOD_INTERVAL_MS, ADVERT_FLOOD_INTERVAL_MS - elapsed);
    }
    const previous = this.#lastFloodAdvertAt;
    this.#lastFloodAdvertAt = Date.now(); // reserve before awaiting: a concurrent call is refused
    try {
      await this.#queue.request('SEND_SELF_ADVERT', encodeSendSelfAdvert({ flood }), ok);
    } catch (error) {
      if (error instanceof RadioError) this.#lastFloodAdvertAt = previous;
      throw error;
    }
  }

  /**
   * Unguarded wrapper around `SEND_TXT_MSG`, used only by `SendQueue`. Bypasses every anti-spam guard: never
   * call it directly, send through `contact.send()` / `channel.send()` instead.
   * @param params Recipient, text, timestamp and attempt
   * @internal
   */
  sendText(params: SendTxtMsgParams): Promise<SentFrame> {
    return this.#queue.request(
      'SEND_TXT_MSG',
      encodeSendTxtMsg(params),
      expectType('sent', (f) => f),
    );
  }

  /**
   * Unguarded wrapper around `SEND_CHANNEL_TXT_MSG`, used only by `SendQueue`. Bypasses every anti-spam guard
   * (Public, the per-channel rate limit): never call it directly, send through `channel.send()` instead.
   * @param params Channel slot, text and timestamp
   * @internal
   */
  sendChannelText(params: SendChannelTxtMsgParams): Promise<void> {
    return this.#queue.request('SEND_CHANNEL_TXT_MSG', encodeSendChannelTxtMsg(params), ok);
  }

  /** @param name 1 to 31 UTF-8 bytes */
  async setAdvertName(name: string): Promise<void> {
    assertRadioName(name);
    await this.#queue.request('SET_ADVERT_NAME', encodeSetAdvertName(name), ok);
  }

  /** @param location lat and lon in decimal degrees */
  async setAdvertLatLon(location: Location): Promise<void> {
    assertLocation(location);
    await this.#queue.request(
      'SET_ADVERT_LATLON',
      encodeSetAdvertLatLon({
        latitude: location.lat,
        longitude: location.lon,
      }),
      ok,
    );
  }

  /** @param dbm -9 to the radio maximum */
  async setTxPower(dbm: number): Promise<void> {
    assertTxPower(dbm);
    await this.#queue.request('SET_RADIO_TX_POWER', encodeSetRadioTxPower(dbm), ok);
  }

  /**
   * @param params frequency in MHz, bandwidth in kHz, spreadingFactor and codingRate
   * @param options repeat writes the repeater byte, firmware 9 and later
   */
  async setRadioParams(params: RadioParams, options: { repeat?: boolean } = {}): Promise<void> {
    assertRadioParams(params);
    const command =
      options.repeat === undefined ? toWireParams(params) : { ...toWireParams(params), repeat: options.repeat };
    await this.#queue.request('SET_RADIO_PARAMS', encodeSetRadioParams(command), ok);
  }
}
