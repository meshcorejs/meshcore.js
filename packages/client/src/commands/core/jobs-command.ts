import { MessageBuilder } from '../../builders/message-builder.js';
import type { Job } from '../../jobs/job.js';
import { Permissions } from '../../permissions/permission-builder.js';
import { formatUsage } from '../command.js';
import { CommandBuilder } from '../command-builder.js';
import { HELPER_MAX_PARTS } from '../command-manager.js';
import type { Replies } from '../replies.js';

function nextRunLabel(job: Job): string | null {
  const next = job.nextRun;
  if (!next) return null;
  const schedule = job.definition.schedule;
  const timeZone = schedule.type === 'cron' ? schedule.timezone : undefined;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(next);
}

function line(job: Job, replies: Replies): string {
  if (job.running) return replies.jobLine(job.name, 'running', null);
  if (job.paused) return replies.jobLine(job.name, 'paused', null);
  return replies.jobLine(job.name, 'scheduled', nextRunLabel(job));
}

export function jobsCommand(): CommandBuilder {
  return new CommandBuilder({ core: true })
    .setName('jobs')
    .setDescription('List, run, pause and resume jobs')
    .setScope('dm')
    .setRequiredPermissions(Permissions.ManageJobs)
    .addChoiceArg((arg) => arg.setName('action').setChoices('run', 'pause', 'resume'))
    .addStringArg((arg) => arg.setName('name'))
    .setHandler(async (ctx) => {
      const { client } = ctx;
      const replies = client.replies;
      if (ctx.args.action === undefined) {
        const jobs = [...client.jobs.cache.values()];
        if (jobs.length === 0) return ctx.reply(replies.noJobs);
        return ctx.reply(
          new MessageBuilder()
            .addLines(jobs.map((job) => line(job, replies)))
            .setOverflow('split', { maxParts: HELPER_MAX_PARTS }),
        );
      }
      if (ctx.args.name === undefined) {
        return ctx.reply(replies.usage(formatUsage(ctx.command, ctx.isDM, client.self.name)));
      }
      const job = client.jobs.get(ctx.args.name);
      if (!job) return ctx.reply(replies.unknownJob);
      switch (ctx.args.action) {
        case 'run':
          if (job.running) return ctx.reply(replies.jobAlreadyRunning(job.name));
          void job.run();
          return ctx.reply(replies.jobStarted(job.name));
        case 'pause':
          if (job.paused) return ctx.reply(replies.jobAlreadyPaused(job.name));
          job.pause();
          return ctx.reply(replies.jobPaused(job.name));
        case 'resume':
          if (!job.paused) return ctx.reply(replies.jobNotPaused(job.name));
          job.resume();
          return ctx.reply(replies.jobResumed(job.name));
      }
    });
}
