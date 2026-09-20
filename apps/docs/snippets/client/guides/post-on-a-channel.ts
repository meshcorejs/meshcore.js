import { CommandBuilder, MessageBuilder } from '@meshcorejs/client';

// #region announce
export default new CommandBuilder()
  .setName('announce')
  .setDescription('Post on the club channel')
  .addStringArg((arg) => arg.setName('text').setRequired().setRest())
  .setHandler(async (ctx) => {
    const channel = ctx.client.channels.get('#club');
    if (!channel) return ctx.reply('#club is not on the radio');
    await channel.send(new MessageBuilder().setTitle('📣 Announcement').addLine(ctx.args.text).setOverflow('split'));
    return ctx.reply('Posted');
  });
// #endregion announce
