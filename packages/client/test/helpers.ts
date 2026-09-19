import { FakeRadio, type FakeRadioOptions, MockTransport } from '@meshcorejs/transports/mock';
import { vi } from 'vitest';
import { Client } from '../src/client/client.js';
import type { Replies } from '../src/commands/replies.js';
import { silentLogger } from '../src/logger.js';

export interface SetupOptions extends FakeRadioOptions {
  /** Call client.login() before returning. Default true. */
  login?: boolean;
  replies?: Partial<Replies>;
}

export async function setupClient(options: SetupOptions = {}) {
  const { login = true, replies, ...radioOptions } = options;
  const transport = new MockTransport();
  const radio = new FakeRadio(radioOptions).attach(transport);
  const client = new Client({ transport, logger: silentLogger, ...(replies ? { replies } : {}) });
  if (login) await client.login();
  return { client, radio, transport };
}

/** Lets queued microtasks and zero-delay timers run (fake timers must be enabled). */
export const flush = () => vi.advanceTimersByTimeAsync(0);
