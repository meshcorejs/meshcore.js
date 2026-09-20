import { CommandBuilder, PluginBuilder } from '@meshcorejs/client';

// #region polls
export const polls = new PluginBuilder<{ channel: string }>()
  .setName('polls')
  .setDescription('One yes/no poll at a time')
  .setBricks((client, { channel }) => {
    const votes = new Map<string, 'yes' | 'no'>();

    return [
      new CommandBuilder()
        .setName('poll')
        .setDescription('Open a poll on the channel')
        .addStringArg((arg) => arg.setName('question').setRequired().setRest())
        .setHandler(async (ctx) => {
          votes.clear();
          await client.channels.get(channel)?.send(`📊 ${ctx.args.question} (/vote yes|no)`);
        }),
      new CommandBuilder()
        .setName('vote')
        .setDescription('Vote on the open poll')
        .addChoiceArg((arg) => arg.setName('answer').setChoices('yes', 'no').setRequired())
        .setHandler((ctx) => {
          votes.set(ctx.author.name, ctx.args.answer);
          return ctx.reply(`${votes.size} votes so far`);
        }),
    ];
  });
// #endregion polls

// #region use
export default polls.configure({ channel: '#club' });
// #endregion use
