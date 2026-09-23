/** First byte of every app → radio command. */
export const CommandCode = {
  AppStart: 1,
  SendTxtMsg: 2,
  SendChannelTxtMsg: 3,
  GetContacts: 4,
  GetDeviceTime: 5,
  SetDeviceTime: 6,
  SendSelfAdvert: 7,
  SetAdvertName: 8,
  AddUpdateContact: 9,
  SyncNextMessage: 10,
  SetRadioParams: 11,
  SetRadioTxPower: 12,
  ResetPath: 13,
  SetAdvertLatLon: 14,
  RemoveContact: 15,
  ExportContact: 17,
  GetBattAndStorage: 20,
  DeviceQuery: 22,
  GetContactByKey: 30,
  GetChannel: 31,
  SetChannel: 32,
} as const;

/** First byte of a radio → app response (below 0x80). */
export const ResponseCode = {
  Ok: 0,
  Err: 1,
  ContactsStart: 2,
  Contact: 3,
  EndOfContacts: 4,
  ExportContact: 11,
  SelfInfo: 5,
  Sent: 6,
  ContactMsgRecv: 7,
  ChannelMsgRecv: 8,
  CurrTime: 9,
  NoMoreMessages: 10,
  BattAndStorage: 12,
  DeviceInfo: 13,
  Disabled: 15,
  ContactMsgRecvV3: 16,
  ChannelMsgRecvV3: 17,
  ChannelInfo: 18,
} as const;

/** First byte of a radio → app push, sent without a command (0x80 and above). */
export const PushCode = {
  Advert: 0x80,
  PathUpdated: 0x81,
  SendConfirmed: 0x82,
  MsgWaiting: 0x83,
  NewAdvert: 0x8a,
  ContactDeleted: 0x8f,
  ContactsFull: 0x90,
} as const;

/** The `errorCode` of an `Err` response. */
export const RadioErrorCode = {
  UnsupportedCmd: 1,
  NotFound: 2,
  TableFull: 3,
  BadState: 4,
  FileIoError: 5,
  IllegalArg: 6,
} as const;

/** Contact kind stored in {@link ContactRecord}'s `type` field: none, chat, repeater, room or sensor. */
export const ContactType = {
  None: 0,
  Chat: 1,
  Repeater: 2,
  Room: 3,
  Sensor: 4,
} as const;

/** The `txtType` of a text message: plain, CLI data, or signed plain. */
export const TxtType = {
  Plain: 0,
  CliData: 1,
  SignedPlain: 2,
} as const;

/** Largest frame payload the firmware accepts, in bytes. */
export const MAX_FRAME_SIZE = 176;
/** A public key, in bytes (64 hex characters). */
export const PUB_KEY_SIZE = 32;
/** The public-key prefix that identifies a sender in received messages, in bytes. */
export const PUB_KEY_PREFIX_SIZE = 6;
/** Largest route (`Path`) the firmware stores, in bytes. */
export const MAX_PATH_SIZE = 64;
/** Longest text in a message, in UTF-8 bytes. */
export const MAX_TEXT_LEN = 160;
/** The fixed-size name field of contacts and self info, in bytes (NUL-padded). */
export const NAME_FIELD_SIZE = 32;
/** A channel secret, in bytes. */
export const CHANNEL_SECRET_SIZE = 16;
/**
 * Secret of the "Public" channel every Companion radio ships with (`PUBLIC_GROUP_PSK` in the firmware's
 * `examples/companion_radio/MyMesh.cpp`). Identify Public by this secret, never by its name.
 */
export const PUBLIC_CHANNEL_SECRET: Uint8Array = Uint8Array.from([
  0x8b, 0x33, 0x87, 0xe9, 0xc5, 0xcd, 0xea, 0x6a, 0xc9, 0xe5, 0xed, 0xba, 0xa1, 0x15, 0xcd, 0x72,
]);
/** The `pathLen` meaning the route to a contact is unknown. */
export const OUT_PATH_UNKNOWN = 0xff;
/** The Companion protocol version this codec speaks. */
export const APP_TARGET_VERSION = 3;
/** Oldest firmware protocol version the client accepts at login. */
export const MIN_FIRMWARE_VERSION = 3;
