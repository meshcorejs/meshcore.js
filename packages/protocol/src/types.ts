import type { Path } from './path.js';

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

export interface OkFrame extends ResponseBase {
  type: 'ok';
}
export interface ErrFrame extends ResponseBase {
  type: 'err';
  errorCode: number | null;
}
export interface DisabledFrame extends ResponseBase {
  type: 'disabled';
}
export interface ContactsStartFrame extends ResponseBase {
  type: 'contactsStart';
  total: number;
}
export interface ContactFrame extends ResponseBase {
  type: 'contact';
  contact: ContactRecord;
}
export interface EndOfContactsFrame extends ResponseBase {
  type: 'endOfContacts';
  mostRecentLastModified: number;
}
export interface ExportContactFrame extends ResponseBase {
  type: 'exportContact';
  packet: Uint8Array;
}
export interface SelfInfoFrame extends ResponseBase {
  type: 'selfInfo';
  selfInfo: SelfInfo;
}
export interface SentFrame extends ResponseBase {
  type: 'sent';
  flood: boolean;
  expectedAck: number;
  suggestedTimeoutMs: number;
}
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
export interface CurrentTimeFrame extends ResponseBase {
  type: 'currentTime';
  epochSeconds: number;
}
export interface NoMoreMessagesFrame extends ResponseBase {
  type: 'noMoreMessages';
}
export interface BattAndStorageFrame extends ResponseBase {
  type: 'battAndStorage';
  batteryMillivolts: number;
  storageUsedKb: number | null;
  storageTotalKb: number | null;
}
export interface DeviceInfoFrame extends ResponseBase {
  type: 'deviceInfo';
  deviceInfo: DeviceInfo;
}
export interface ChannelInfoFrame extends ResponseBase {
  type: 'channelInfo';
  channel: ChannelRecord;
}

export interface AdvertPush extends PushBase {
  type: 'advert';
  publicKey: string;
}
export interface PathUpdatedPush extends PushBase {
  type: 'pathUpdated';
  publicKey: string;
}
export interface SendConfirmedPush extends PushBase {
  type: 'sendConfirmed';
  ack: number;
  roundTripMs: number;
}
export interface MsgWaitingPush extends PushBase {
  type: 'msgWaiting';
}
export interface NewAdvertPush extends PushBase {
  type: 'newAdvert';
  contact: ContactRecord;
}
export interface ContactDeletedPush extends PushBase {
  type: 'contactDeleted';
  publicKey: string;
}
export interface ContactsFullPush extends PushBase {
  type: 'contactsFull';
}

export interface UnknownFrame {
  kind: 'response' | 'push';
  type: 'unknown';
  code: number;
  bytes: Uint8Array;
}

export interface MalformedFrame {
  kind: 'response' | 'push';
  type: 'malformed';
  code: number;
  bytes: Uint8Array;
  reason: string;
}

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

export type PushFrame =
  | AdvertPush
  | PathUpdatedPush
  | SendConfirmedPush
  | MsgWaitingPush
  | NewAdvertPush
  | ContactDeletedPush
  | ContactsFullPush;

export type DecodedFrame = ResponseFrame | PushFrame | UnknownFrame | MalformedFrame;
