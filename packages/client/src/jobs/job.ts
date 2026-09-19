import { Cron } from 'croner';
import type { Client } from '../client/client.js';
import { JobTimeoutError } from '../errors.js';
import type { JobDefinition } from './job-builder.js';

export class Job {
  readonly client: Client;
  readonly name: string;
  /** @internal */
  readonly definition: JobDefinition;
  #cron: Cron | null = null;
  #interval: ReturnType<typeof setInterval> | null = null;
  #nextIntervalRun: Date | null = null;
  #started = false;
  #paused = false;
  #running: Promise<void> | null = null;
  #queued = 0;
  #lastRun: Date | null = null;
  #controller: AbortController | null = null;

  /**
   * @param client Owning client
   * @param definition Built by JobBuilder
   */
  constructor(client: Client, definition: JobDefinition) {
    this.client = client;
    this.definition = definition;
    this.name = definition.name;
  }

  get running(): boolean {
    return this.#running !== null;
  }

  get paused(): boolean {
    return this.#paused;
  }

  get lastRun(): Date | null {
    return this.#lastRun;
  }

  get nextRun(): Date | null {
    if (!this.#started || this.#paused) return null;
    return this.#cron ? this.#cron.nextRun() : this.#nextIntervalRun;
  }

  run(): Promise<void> {
    return this.#trigger(true);
  }

  pause(): void {
    this.#paused = true;
    this.#cron?.pause();
  }

  resume(): void {
    this.#paused = false;
    this.#cron?.resume();
  }

  /** @internal */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    const { schedule } = this.definition;
    if (schedule.type === 'cron') {
      const options = { paused: this.#paused, ...(schedule.timezone ? { timezone: schedule.timezone } : {}) };
      this.#cron = new Cron(schedule.expression, options, () => {
        void this.#trigger(false);
      });
    } else {
      const ms = schedule.seconds * 1000;
      this.#nextIntervalRun = new Date(Date.now() + ms);
      this.#interval = setInterval(() => {
        this.#nextIntervalRun = new Date(Date.now() + ms);
        if (!this.#paused) void this.#trigger(false);
      }, ms);
    }
    if (this.definition.runOnStart) void this.#trigger(false);
  }

  /** @internal */
  stop(): void {
    this.#started = false;
    this.#cron?.stop();
    this.#cron = null;
    if (this.#interval) clearInterval(this.#interval);
    this.#interval = null;
    this.#queued = 0;
    this.#controller?.abort(new Error('job stopped'));
  }

  async #trigger(manual: boolean): Promise<void> {
    if (!manual && this.definition.requiresConnection && !this.client.isReady) {
      this.client.logger.debug(`job "${this.name}" skipped: radio not connected`);
      return;
    }
    if (this.#running) {
      if (this.definition.overlap === 'skip') {
        this.client.logger.debug(`job "${this.name}" skipped: previous run still in progress`);
        return;
      }
      this.#queued++;
      return;
    }
    this.#running = this.#execute().finally(() => {
      this.#running = null;
      if (this.#queued > 0) {
        this.#queued--;
        void this.#trigger(manual);
      }
    });
    return this.#running;
  }

  async #execute(): Promise<void> {
    const controller = new AbortController();
    this.#controller = controller;
    const info = { name: this.name, signal: controller.signal, lastRun: this.#lastRun, nextRun: this.nextRun };
    this.#lastRun = new Date();
    const { timeoutSeconds } = this.definition;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const run = Promise.resolve().then(() => this.definition.handler(this.client, info));
      if (timeoutSeconds > 0) {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new JobTimeoutError(this.name, timeoutSeconds);
            controller.abort(error);
            reject(error);
          }, timeoutSeconds * 1000);
        });
        run.catch(() => undefined);
        await Promise.race([run, timeout]);
      } else {
        await run;
      }
    } catch (error) {
      this.client._reportError(error, { type: 'job', name: this.name });
    } finally {
      clearTimeout(timer);
      if (this.#controller === controller) this.#controller = null;
    }
  }
}
