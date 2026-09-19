import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobTimeoutError, LoadError } from '../src/errors.js';
import { JobBuilder } from '../src/jobs/job-builder.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-21T06:58:00+02:00') }); // Monday
});

afterEach(() => {
  vi.useRealTimers();
});

function issues(builder: JobBuilder): string[] {
  try {
    builder.build();
    return [];
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    return error.issues.map((issue) => issue.message);
  }
}

describe('JobBuilder validation', () => {
  it('requires a name, exactly one schedule and a handler', () => {
    expect(issues(new JobBuilder())).toEqual([
      'name must match /^[a-z0-9_-]{1,32}$/',
      'setCron() or setInterval() is required',
      'setHandler() is required',
    ]);
    expect(
      issues(
        new JobBuilder()
          .setName('x')
          .setCron('* * * * *')
          .setInterval(5)
          .setHandler(() => {}),
      ),
    ).toEqual(['use either setCron() or setInterval(), not both']);
  });

  it('rejects invalid cron expressions and intervals', () => {
    expect(
      issues(
        new JobBuilder()
          .setName('x')
          .setCron('every monday')
          .setHandler(() => {}),
      )[0],
    ).toMatch(/^invalid cron "every monday"/);
    expect(
      issues(
        new JobBuilder()
          .setName('x')
          .setInterval(0)
          .setHandler(() => {}),
      ),
    ).toEqual(['interval must be > 0']);
  });
});

describe('scheduling', () => {
  it('runs cron jobs in their timezone once the client is ready', async () => {
    const { client } = await setupClient({ login: false });
    const handler = vi.fn();
    client.register(
      new JobBuilder().setName('bulletin').setCron('0 7 * * 1-5', { timezone: 'Europe/Paris' }).setHandler(handler),
    );
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(handler).not.toHaveBeenCalled();

    await client.login();
    const job = client.jobs.get('bulletin')!;
    expect(job.nextRun).toEqual(new Date('2026-09-22T07:00:00+02:00'));
    await vi.advanceTimersByTimeAsync(24 * 3600_000);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(client, expect.objectContaining({ name: 'bulletin', lastRun: null }));
    expect(job.lastRun).toEqual(new Date('2026-09-22T07:00:00+02:00'));
  });

  it('runs interval jobs, and once on start when asked', async () => {
    const { client } = await setupClient({ login: false });
    const handler = vi.fn();
    client.register(new JobBuilder().setName('ping').setInterval(60).setRunOnStart().setHandler(handler));
    await client.login();
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it('skips scheduled runs while disconnected unless told otherwise', async () => {
    const { client, transport } = await setupClient({ login: false });
    const connected = vi.fn();
    const always = vi.fn();
    client.register([
      new JobBuilder().setName('connected').setInterval(10).setHandler(connected),
      new JobBuilder().setName('always').setInterval(10).setRequiresConnection(false).setHandler(always),
    ]);
    await client.login();
    vi.spyOn(transport, 'connect').mockRejectedValue(new Error('down'));
    transport.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(connected).not.toHaveBeenCalled();
    expect(always).toHaveBeenCalledTimes(3);
  });

  it('skips or queues overlapping runs', async () => {
    const { client } = await setupClient({ login: false });
    const slow = (log: string[], name: string) => async () => {
      log.push(`${name} start`);
      await new Promise((resolve) => setTimeout(resolve, 25_000));
      log.push(`${name} end`);
    };
    const log: string[] = [];
    client.register([
      new JobBuilder().setName('skip').setInterval(10).setHandler(slow(log, 'skip')),
      new JobBuilder().setName('queue').setInterval(10).setOverlap('queue').setHandler(slow(log, 'queue')),
    ]);
    await client.login();
    await vi.advanceTimersByTimeAsync(35_000);
    expect(log.filter((l) => l.startsWith('skip'))).toEqual(['skip start', 'skip end']);
    expect(log.filter((l) => l.startsWith('queue'))).toEqual(['queue start', 'queue end', 'queue start']);
  });

  it('aborts runs that exceed their timeout and reports JobTimeoutError', async () => {
    const { client } = await setupClient({ login: false });
    const onError = vi.fn();
    client.on('error', onError);
    let signal: AbortSignal | undefined;
    client.register(
      new JobBuilder()
        .setName('slow')
        .setInterval(100)
        .setTimeout(5)
        .setHandler((_client, job) => {
          signal = job.signal;
          return new Promise(() => {});
        }),
    );
    await client.login();
    await vi.advanceTimersByTimeAsync(105_000);
    expect(signal?.aborted).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.any(JobTimeoutError), { type: 'job', name: 'slow' });
    expect(client.jobs.get('slow')?.running).toBe(false);
  });

  it('reports handler errors', async () => {
    const { client } = await setupClient({ login: false });
    const onError = vi.fn();
    client.on('error', onError);
    client.register(
      new JobBuilder()
        .setName('boom')
        .setInterval(10)
        .setHandler(() => {
          throw new Error('api down');
        }),
    );
    await client.login();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onError).toHaveBeenCalledWith(new Error('api down'), { type: 'job', name: 'boom' });
  });

  it('can be run manually, paused and resumed', async () => {
    const { client } = await setupClient({ login: false });
    const handler = vi.fn();
    client.register(new JobBuilder().setName('bulletin').setInterval(10).setHandler(handler));
    await client.login();
    const job = client.jobs.get('bulletin')!;
    await job.run();
    expect(handler).toHaveBeenCalledTimes(1);

    job.pause();
    expect(job.paused).toBe(true);
    expect(job.nextRun).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handler).toHaveBeenCalledTimes(1);

    job.resume();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('stops jobs on destroy and refuses duplicate names', async () => {
    const { client } = await setupClient({ login: false });
    const handler = vi.fn();
    client.register(new JobBuilder().setName('tick').setInterval(1).setHandler(handler));
    await client.login();
    await client.destroy();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(handler).not.toHaveBeenCalled();

    const other = await setupClient({ login: false });
    other.client.register([
      new JobBuilder()
        .setName('a')
        .setInterval(1)
        .setHandler(() => {}),
      new JobBuilder()
        .setName('a')
        .setInterval(2)
        .setHandler(() => {}),
    ]);
    await expect(other.client.login()).rejects.toThrow('duplicate job name');
  });
});
