import type { Client } from '../client/client.js';
import { Collection } from '../collection.js';
import type { LoadIssue } from '../errors.js';
import { Job } from './job.js';
import type { JobDefinition } from './job-builder.js';

export class JobManager {
  readonly client: Client;
  readonly cache = new Collection<string, Job>();
  readonly #all: Job[] = [];
  #started = false;

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
  }

  get size(): number {
    return this.cache.size;
  }

  /** @param name Job name */
  get(name: string): Job | undefined {
    return this.cache.get(name.toLowerCase());
  }

  /** @internal */
  add(definition: JobDefinition): Job {
    const job = new Job(this.client, definition);
    this.#all.push(job);
    this.#rebuildCache();
    if (this.#started) job.start();
    return job;
  }

  /** @internal */
  remove(job: Job): void {
    const index = this.#all.indexOf(job);
    if (index === -1) return;
    this.#all.splice(index, 1);
    job.stop();
    this.#rebuildCache();
  }

  /** @internal */
  validate(): LoadIssue[] {
    const seen = new Set<string>();
    const issues: LoadIssue[] = [];
    for (const job of this.#all) {
      if (seen.has(job.name)) issues.push({ brick: `job "${job.name}"`, message: 'duplicate job name' });
      seen.add(job.name);
    }
    return issues;
  }

  /** @internal */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    for (const job of this.#all) job.start();
  }

  /** @internal */
  stop(): void {
    this.#started = false;
    for (const job of this.#all) job.stop();
  }

  #rebuildCache(): void {
    this.cache.clear();
    for (const job of this.#all) if (!this.cache.has(job.name)) this.cache.set(job.name, job);
  }
}
