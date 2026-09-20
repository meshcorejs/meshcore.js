export {
  type AckMode,
  FakeRadio,
  type FakeRadioOptions,
  type FakeSentMessage,
  fakeContactRecord,
  MockTransport,
} from '@meshcorejs/transports/mock';
export { parseDuration } from './duration.js';
export { createTestClient, type TestBot, type TestClientOptions } from './test-client.js';

import { fakeContactRecord } from '@meshcorejs/transports/mock';

/** The public key `fakeContactRecord({ name })` gives to `name`, to reference a fake contact in roles or assertions. */
export function fakeContactKey(name: string): string {
  return fakeContactRecord({ name }).publicKey;
}
