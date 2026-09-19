import { CommandBuilder } from '@meshcorejs/client';

// Simulates a slow API call (fake timers) followed by a reply.
export default new CommandBuilder().setName('slow').setHandler(async (ctx) => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await ctx.reply('done');
});
