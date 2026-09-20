import { CommandBuilder, Permissions, RoleBuilder } from '@meshcorejs/client';

// #region owner
export const owner = new RoleBuilder()
  .setName('owner')
  .setDescription('Bot owners')
  .setPriority(1000)
  .addPermissions(Permissions.Administrator)
  .setMembers((process.env.OWNER_KEYS ?? '').split(',').filter(Boolean));
// #endregion owner

// #region announce
export default new CommandBuilder()
  .setName('announce')
  .setDescription('Post on the club channel')
  .addStringArg((arg) => arg.setName('text').setRequired().setRest())
  .setRequiredPermissions(Permissions.Administrator)
  .setHandler(async (ctx) => {
    await ctx.client.channels.get('#club')?.send(ctx.args.text);
    return ctx.reply('Posted');
  });
// #endregion announce
