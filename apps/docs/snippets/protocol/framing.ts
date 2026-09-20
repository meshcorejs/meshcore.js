// #region encode
import { encodeFrame, encodeSendTxtMsg } from '@meshcorejs/protocol';

const payload = encodeSendTxtMsg({
  recipient: 'a1b2c3d4e5f6',
  text: 'hello',
  timestamp: Math.floor(Date.now() / 1000),
});

const frame = encodeFrame(payload, 'toRadio');
console.log(`frame: ${frame.length} bytes, marker 0x${frame[0]?.toString(16)}`);

// #endregion encode

// #region decode
import { FrameDecoder } from '@meshcorejs/protocol';

const decoder = new FrameDecoder('fromRadio');

/** Feed this every chunk a transport reads off the wire, in any split. */
export function onChunk(chunk: Uint8Array): void {
  for (const framePayload of decoder.push(chunk)) {
    console.log(`decoded ${framePayload.length}-byte payload`);
  }
}
// #endregion decode
