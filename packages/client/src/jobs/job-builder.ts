import { Cron } from 'croner';
import { BRICK, type Brick } from '../bricks/brick.js';
import type { Client } from '../client/client.js';
import { LoadError } from '../errors.js';

export const JOB_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;

/** What happens when a job fires while its previous run is still going: `skip` drops the tick, `queue` runs it right after. */
export type OverlapPolicy = 'skip' | 'queue';

/** What a job handler receives about the current run: the job name, an abort signal (timeout or shutdown), and the last and next run dates. */
export interface JobRunInfo {
  readonly name: string;
  readonly signal: AbortSignal;
  readonly lastRun: Date | null;
  readonly nextRun: Date | null;
}

/** When a job runs: a cron expression (with optional IANA timezone) or a fixed interval in seconds. */
export type JobSchedule =
  | { type: 'cron'; expression: string; timezone: string | undefined }
  | { type: 'interval'; seconds: number };

/** What a `JobBuilder` builds: name, schedule, run-on-start, overlap policy, timeout, connection requirement and handler. */
export interface JobDefinition {
  name: string;
  schedule: JobSchedule;
  runOnStart: boolean;
  overlap: OverlapPolicy;
  timeoutSeconds: number;
  requiresConnection: boolean;
  handler: (client: Client, job: JobRunInfo) => unknown;
}

export class JobBuilder implements Brick<JobDefinition> {
  readonly [BRICK] = 'job' as const;
  #name = '';
  #cron: { expression: string; timezone: string | undefined } | null = null;
  #intervalSeconds: number | null = null;
  #runOnStart = false;
  #overlap: OverlapPolicy = 'skip';
  #timeoutSeconds = 0;
  #requiresConnection = true;
  #handler: JobDefinition['handler'] | null = null;

  /** @param name Lowercase, letters digits _ and -, 1 to 32 characters */
  setName(name: string): this {
    this.#name = name;
    return this;
  }

  /**
   * @param expression Cron expression
   * @param options timezone is an IANA name
   */
  setCron(expression: string, options: { timezone?: string } = {}): this {
    this.#cron = { expression, timezone: options.timezone };
    return this;
  }

  /** @param seconds Delay between two runs */
  setInterval(seconds: number): this {
    this.#intervalSeconds = seconds;
    return this;
  }

  /** @param runOnStart Run once when the client is ready. Default true */
  setRunOnStart(runOnStart = true): this {
    this.#runOnStart = runOnStart;
    return this;
  }

  /** @param policy skip or queue a run while the previous one is still going */
  setOverlap(policy: OverlapPolicy): this {
    this.#overlap = policy;
    return this;
  }

  /** @param seconds Abort the run after this delay. 0 disables */
  setTimeout(seconds: number): this {
    this.#timeoutSeconds = seconds;
    return this;
  }

  /** @param requiresConnection Skip scheduled runs while the radio is disconnected */
  setRequiresConnection(requiresConnection: boolean): this {
    this.#requiresConnection = requiresConnection;
    return this;
  }

  /** @param handler Receives the client and the run info */
  setHandler(handler: (client: Client, job: JobRunInfo) => unknown): this {
    this.#handler = handler;
    return this;
  }

  build(): JobDefinition {
    const problems: string[] = [];
    if (!JOB_NAME_PATTERN.test(this.#name)) problems.push(`name must match ${JOB_NAME_PATTERN}`);
    if (this.#cron && this.#intervalSeconds !== null) problems.push('use either setCron() or setInterval(), not both');
    if (!this.#cron && this.#intervalSeconds === null) problems.push('setCron() or setInterval() is required');
    if (this.#cron) {
      try {
        new Cron(this.#cron.expression, {
          paused: true,
          ...(this.#cron.timezone ? { timezone: this.#cron.timezone } : {}),
        }).stop();
      } catch (error) {
        problems.push(`invalid cron "${this.#cron.expression}": ${(error as Error).message}`);
      }
    }
    if (this.#intervalSeconds !== null && !(this.#intervalSeconds > 0)) problems.push('interval must be > 0');
    if (!(this.#timeoutSeconds >= 0)) problems.push('timeout must be >= 0');
    if (!this.#handler) problems.push('setHandler() is required');
    if (problems.length > 0) {
      throw new LoadError(problems.map((message) => ({ brick: `job "${this.#name || '?'}"`, message })));
    }
    return {
      name: this.#name,
      schedule: this.#cron
        ? { type: 'cron', expression: this.#cron.expression, timezone: this.#cron.timezone }
        : { type: 'interval', seconds: this.#intervalSeconds as number },
      runOnStart: this.#runOnStart,
      overlap: this.#overlap,
      timeoutSeconds: this.#timeoutSeconds,
      requiresConnection: this.#requiresConnection,
      handler: this.#handler as JobDefinition['handler'],
    };
  }
}
