import type { Path } from './path.js';

/** A contact as stored by the radio: key, kind (`ContactType`), flags, route, name, last advert, location, last modification. */
export interface ContactRecord {
  publicKey: string;
  type: number;
  flags: number;
  outPath: Path | null;
  name: string;
  lastAdvertTimestamp: number;
  latitude: number;
  longitude: number;
  lastModified: number;
}

/** What the radio says about itself at `APP_START`: key, name, power, location, radio parameters and policies. */
export interface SelfInfo {
  advertType: number;
  txPowerDbm: number;
  maxTxPowerDbm: number;
  publicKey: string;
  latitude: number;
  longitude: number;
  multiAcks: number;
  advertLocationPolicy: number;
  telemetryModes: { base: number; location: number; environment: number };
  manualAddContacts: boolean;
  radio: { frequencyKhz: number; bandwidthHz: number; spreadingFactor: number; codingRate: number };
  name: string;
}

/** What `DEVICE_QUERY` returns: firmware version and, on newer firmwares, limits and build details (`null` when absent). */
export interface DeviceInfo {
  firmwareVersion: number;
  maxContacts: number | null;
  maxChannels: number | null;
  blePin: number | null;
  firmwareBuildDate: string | null;
  manufacturer: string | null;
  firmwareVersionName: string | null;
  repeatEnabled: boolean | null;
  pathHashMode: number | null;
}

/** A channel slot of the radio: index, name and 16-byte secret. */
export interface ChannelRecord {
  index: number;
  name: string;
  secret: Uint8Array;
}

interface ResponseBase {
  kind: 'response';
}

interface PushBase {
  kind: 'push';
}

/** `Ok` response. */
export interface OkFrame extends ResponseBase {
  type: 'ok';
}
/** `Err` response, with a `RadioErrorCode`. */
export interface ErrFrame extends ResponseBase {
  type: 'err';
  errorCode: number | null;
}
/** `Disabled` response: the firmware refused the command because the feature is disabled. */
export interface DisabledFrame extends ResponseBase {
  type: 'disabled';
}
/** `ContactsStart` response: a listing begins. */
export interface ContactsStartFrame extends ResponseBase {
  type: 'contactsStart';
  total: number;
}
/** `Contact` response: one contact of a listing or of `GET_CONTACT_BY_KEY`. */
export interface ContactFrame extends ResponseBase {
  type: 'contact';
  contact: ContactRecord;
}
/** `EndOfContacts` response: the listing is complete. */
export interface EndOfContactsFrame extends ResponseBase {
  type: 'endOfContacts';
  mostRecentLastModified: number;
}
/** `ExportContact` response: an advert packet. */
export interface ExportContactFrame extends ResponseBase {
  type: 'exportContact';
  packet: Uint8Array;
}
/** `SelfInfo` response to `APP_START`. */
export interface SelfInfoFrame extends ResponseBase {
  type: 'selfInfo';
  selfInfo: SelfInfo;
}
/** `Sent` response to a text message: flood or direct, the ack to expect and the suggested timeout. */
export interface SentFrame extends ResponseBase {
  type: 'sent';
  flood: boolean;
  expectedAck: number;
  suggestedTimeoutMs: number;
}
/** A received direct message: sender prefix, route info, text, and a signature on version 3. */
export interface ContactMessageFrame extends ResponseBase {
  type: 'contactMessage';
  version: 2 | 3;
  snr: number | null;
  senderPrefix: string;
  pathLen: number;
  hopCount: number | null;
  txtType: number;
  senderTimestamp: number;
  signature: string | null;
  text: string;
}
/** A received channel message: channel index, route info and text. */
export interface ChannelMessageFrame extends ResponseBase {
  type: 'channelMessage';
  version: 2 | 3;
  snr: number | null;
  channelIndex: number;
  pathLen: number;
  hopCount: number | null;
  txtType: number;
  senderTimestamp: number;
  text: string;
}
/** `CurrTime` response: the radio's clock. */
export interface CurrentTimeFrame extends ResponseBase {
  type: 'currentTime';
  epochSeconds: number;
}
/** `NoMoreMessages` response: nothing left to sync. */
export interface NoMoreMessagesFrame extends ResponseBase {
  type: 'noMoreMessages';
}
/** `BattAndStorage` response: battery millivolts and storage usage. */
export interface BattAndStorageFrame extends ResponseBase {
  type: 'battAndStorage';
  batteryMillivolts: number;
  storageUsedKb: number | null;
  storageTotalKb: number | null;
}
/** `DeviceInfo` response to `DEVICE_QUERY`. */
export interface DeviceInfoFrame extends ResponseBase {
  type: 'deviceInfo';
  deviceInfo: DeviceInfo;
}
/** `ChannelInfo` response to `GET_CHANNEL`. */
export interface ChannelInfoFrame extends ResponseBase {
  type: 'channelInfo';
  channel: ChannelRecord;
}

/** `Advert` push: a known contact advertised again. */
export interface AdvertPush extends PushBase {
  type: 'advert';
  publicKey: string;
}
/** `PathUpdated` push: the route to a contact changed. */
export interface PathUpdatedPush extends PushBase {
  type: 'pathUpdated';
  publicKey: string;
}
/** `SendConfirmed` push: a direct message was acknowledged, with the round trip time. */
export interface SendConfirmedPush extends PushBase {
  type: 'sendConfirmed';
  ack: number;
  roundTripMs: number;
}
/** `MsgWaiting` push: a message is ready to sync. */
export interface MsgWaitingPush extends PushBase {
  type: 'msgWaiting';
}
/** `NewAdvert` push: an unknown node advertised, with its would-be contact record. */
export interface NewAdvertPush extends PushBase {
  type: 'newAdvert';
  contact: ContactRecord;
}
/** `ContactDeleted` push. */
export interface ContactDeletedPush extends PushBase {
  type: 'contactDeleted';
  publicKey: string;
}
/** `ContactsFull` push: the contact table is full. */
export interface ContactsFullPush extends PushBase {
  type: 'contactsFull';
}

/** A frame whose code this codec does not know; the raw bytes are kept. */
export interface UnknownFrame {
  kind: 'response' | 'push';
  type: 'unknown';
  code: number;
  bytes: Uint8Array;
}

/** A frame whose bytes do not fit the layout of its code; `reason` says what failed. */
export interface MalformedFrame {
  kind: 'response' | 'push';
  type: 'malformed';
  code: number;
  bytes: Uint8Array;
  reason: string;
}

/** Every decoded response, discriminated by `type`. */
export type ResponseFrame =
  | OkFrame
  | ErrFrame
  | DisabledFrame
  | ContactsStartFrame
  | ContactFrame
  | EndOfContactsFrame
  | ExportContactFrame
  | SelfInfoFrame
  | SentFrame
  | ContactMessageFrame
  | ChannelMessageFrame
  | CurrentTimeFrame
  | NoMoreMessagesFrame
  | BattAndStorageFrame
  | DeviceInfoFrame
  | ChannelInfoFrame;

/** Every decoded push, discriminated by `type`. */
export type PushFrame =
  | AdvertPush
  | PathUpdatedPush
  | SendConfirmedPush
  | MsgWaitingPush
  | NewAdvertPush
  | ContactDeletedPush
  | ContactsFullPush;

/** What `decodeFrame()` returns: a response, a push, or an `unknown` / `malformed` frame. */
export type DecodedFrame = ResponseFrame | PushFrame | UnknownFrame | MalformedFrame;
