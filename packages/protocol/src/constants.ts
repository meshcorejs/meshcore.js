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

export const PushCode = {
  Advert: 0x80,
  PathUpdated: 0x81,
  SendConfirmed: 0x82,
  MsgWaiting: 0x83,
  NewAdvert: 0x8a,
  ContactDeleted: 0x8f,
  ContactsFull: 0x90,
} as const;

export const RadioErrorCode = {
  UnsupportedCmd: 1,
  NotFound: 2,
  TableFull: 3,
  BadState: 4,
  FileIoError: 5,
  IllegalArg: 6,
} as const;

export const ContactType = {
  None: 0,
  Chat: 1,
  Repeater: 2,
  Room: 3,
  Sensor: 4,
} as const;

export const TxtType = {
  Plain: 0,
  CliData: 1,
  SignedPlain: 2,
} as const;

export const MAX_FRAME_SIZE = 176;
export const PUB_KEY_SIZE = 32;
export const PUB_KEY_PREFIX_SIZE = 6;
export const MAX_PATH_SIZE = 64;
export const MAX_TEXT_LEN = 160;
export const NAME_FIELD_SIZE = 32;
export const CHANNEL_SECRET_SIZE = 16;
export const OUT_PATH_UNKNOWN = 0xff;
export const APP_TARGET_VERSION = 3;
export const MIN_FIRMWARE_VERSION = 3;
