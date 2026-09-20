// #region switch
import { decodeFrame } from '@meshcorejs/protocol';

export function handleFrame(bytes: Uint8Array): void {
  const frame = decodeFrame(bytes);
  switch (frame.type) {
    case 'contactMessage':
      console.log(`DM from ${frame.senderPrefix}: ${frame.text}`);
      break;
    case 'channelMessage':
      console.log(`channel ${frame.channelIndex}: ${frame.text}`);
      break;
    case 'unknown':
      console.log(`unknown frame code 0x${frame.code.toString(16)}`);
      break;
    default:
      // 'malformed', or any response/push this snippet does not react to
      break;
  }
}
// #endregion switch
