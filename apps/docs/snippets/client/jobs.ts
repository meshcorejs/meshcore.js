import { Client, JobBuilder, SerialTransport } from '@meshcorejs/client';

// #region options
export default new JobBuilder()
  .setName('health-check')
  .setInterval(300)
  .setRunOnStart()
  .setOverlap('queue')
  .setTimeout(30)
  .setRequiresConnection(false)
  .setHandler(async (client, job) => {
    if (job.signal.aborted) return;
    client.logger.info(`last run: ${job.lastRun?.toISOString() ?? 'never'}`);
  });
// #endregion options

const client = new Client({ transport: new SerialTransport({ path: '/dev/ttyACM0' }) });
await client.login();

// #region lifecycle
const healthCheck = client.jobs.get('health-check');
await healthCheck?.run();
healthCheck?.pause();
healthCheck?.resume();
console.log(healthCheck?.nextRun, healthCheck?.lastRun, healthCheck?.running);
// #endregion lifecycle

// #region errors
client.on('error', (error, source) => {
  if (source.type === 'job') console.error(`job "${source.name}" failed:`, error);
});
// #endregion errors
