import { RadioErrorCode } from '@meshcorejs/protocol';
import { MeshcoreError } from '@meshcorejs/transports';
import type { RadioSetting } from './radio/radio-config.js';

export { ConnectionError, MeshcoreError, MissingDependencyError } from '@meshcorejs/transports';

/** Thrown when a `Client` method is called in a state that forbids it (e.g. before `login()` resolves). */
export class ClientStateError extends MeshcoreError {
  /** @param message What was called in the wrong state */
  constructor(message: string) {
    super('INVALID_STATE', message);
  }
}

/** Thrown by `login()` when the radio's Companion protocol version is older than the library requires. */
export class UnsupportedFirmwareError extends MeshcoreError {
  readonly firmwareVersion: number;
  readonly minimumVersion: number;

  /**
   * @param firmwareVersion Version reported by the radio
   * @param minimumVersion Version the library needs
   */
  constructor(firmwareVersion: number, minimumVersion: number) {
    super(
      'UNSUPPORTED_FIRMWARE',
      `radio firmware protocol version ${firmwareVersion} is not supported, version ${minimumVersion} or newer is required`,
    );
    this.firmwareVersion = firmwareVersion;
    this.minimumVersion = minimumVersion;
  }
}

/** Thrown when the radio does not answer a Companion command within its timeout. */
export class CommandTimeoutError extends MeshcoreError {
  readonly command: string;
  readonly timeoutMs: number;

  /**
   * @param command Companion command name
   * @param timeoutMs Delay waited
   */
  constructor(command: string, timeoutMs: number) {
    super('COMMAND_TIMEOUT', `radio did not answer ${command} within ${timeoutMs} ms`);
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

const RADIO_ERROR_LABELS: Record<number, string> = {
  [RadioErrorCode.UnsupportedCmd]: 'unsupported command',
  [RadioErrorCode.NotFound]: 'not found',
  [RadioErrorCode.TableFull]: 'table full',
  [RadioErrorCode.BadState]: 'bad state',
  [RadioErrorCode.FileIoError]: 'file I/O error',
  [RadioErrorCode.IllegalArg]: 'illegal argument',
};

/** Thrown when the radio rejects a Companion command with an error code. */
export class RadioError extends MeshcoreError {
  readonly command: string;
  readonly radioCode: number | null;

  /**
   * @param command Companion command name
   * @param radioCode Error code sent by the radio, or null
   * @param detail Replaces the code label
   */
  constructor(command: string, radioCode: number | null, detail?: string) {
    const label = detail ?? (radioCode === null ? 'error' : (RADIO_ERROR_LABELS[radioCode] ?? `error ${radioCode}`));
    super('RADIO_ERROR', `radio rejected ${command}: ${label}`);
    this.command = command;
    this.radioCode = radioCode;
  }
}

/** Thrown when the radio has no free channel or contact slot left for the requested operation. */
export class LimitReachedError extends MeshcoreError {
  readonly resource: 'channels' | 'contacts';
  readonly limit: number;

  /**
   * @param resource channels or contacts
   * @param limit Slots on the radio
   */
  constructor(resource: 'channels' | 'contacts', limit: number) {
    super('LIMIT_REACHED', `no free ${resource} slot on the radio (limit ${limit})`);
    this.resource = resource;
    this.limit = limit;
  }
}

/**
 * Thrown when a plain string does not fit its text budget; `MessageBuilder` with `setOverflow('truncate' |
 * 'split')` avoids it instead of throwing.
 */
export class MessageTooLongError extends MeshcoreError {
  readonly bytes: number;
  readonly limit: number;

  /**
   * @param bytes Size of the message
   * @param limit Budget it had to fit in
   */
  constructor(bytes: number, limit: number) {
    super(
      'MESSAGE_TOO_LONG',
      `message is ${bytes} bytes but only ${limit} fit; shorten it or use a MessageBuilder with setOverflow('split' | 'truncate')`,
    );
    this.bytes = bytes;
    this.limit = limit;
  }
}

/** Why a DM delivery failed: no ACK after retries, expired in the queue, a radio error, or the client was destroyed. */
export type DeliveryFailureReason = 'noAck' | 'expired' | 'radio' | 'destroyed';

/** Rejection reason of the promise returned by `contact.send()` / `SentMessage` when a DM was not delivered. */
export class DeliveryFailedError extends MeshcoreError {
  readonly reason: DeliveryFailureReason;

  /**
   * @param reason noAck, expired, radio or destroyed
   * @param message Human readable detail
   * @param options cause
   */
  constructor(reason: DeliveryFailureReason, message: string, options?: ErrorOptions) {
    super('DELIVERY_FAILED', message, options);
    this.reason = reason;
  }
}

/** One problem found while validating or loading a brick: which file and brick, and what was wrong. */
export interface LoadIssue {
  file?: string;
  brick: string;
  message: string;
}

/** Thrown by `load()`, `login()` and `plugin.load()/unload()/reload()` when one or more bricks fail validation. */
export class LoadError extends MeshcoreError {
  readonly issues: readonly LoadIssue[];

  /** @param issues Every problem found, with file and brick */
  constructor(issues: LoadIssue[]) {
    const lines = issues.map((issue) => `  ${issue.file ? `${issue.file} › ` : ''}${issue.brick} › ${issue.message}`);
    super('LOAD_FAILED', `${issues.length} problem(s) in bot bricks:\n${lines.join('\n')}`);
    this.issues = Object.freeze([...issues]);
  }
}

/** Thrown internally when a job's handler does not finish within its configured timeout; reported via `error`. */
export class JobTimeoutError extends MeshcoreError {
  readonly job: string;
  readonly timeoutSeconds: number;

  /**
   * @param job Job name
   * @param timeoutSeconds Delay waited
   */
  constructor(job: string, timeoutSeconds: number) {
    super('JOB_TIMEOUT', `job "${job}" did not finish within ${timeoutSeconds} s and was aborted`);
    this.job = job;
    this.timeoutSeconds = timeoutSeconds;
  }
}

/** Thrown by `login()` when the radio refuses a setting from the `RadioConfig` applied at startup. */
export class RadioConfigError extends MeshcoreError {
  readonly setting: RadioSetting;
  readonly radioCode: number | null;

  /**
   * @param setting name, location, txPower or params
   * @param message Human readable detail
   * @param radioCode Error code sent by the radio, or null
   * @param options cause
   */
  constructor(setting: RadioSetting, message: string, radioCode: number | null = null, options?: ErrorOptions) {
    super('RADIO_CONFIG_REJECTED', message, options);
    this.setting = setting;
    this.radioCode = radioCode;
  }
}
