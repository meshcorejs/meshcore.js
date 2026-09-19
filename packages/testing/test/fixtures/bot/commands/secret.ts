import { CommandBuilder, Permissions } from '@meshcorejs/client';

export default new CommandBuilder()
  .setName('secret')
  .setRequiredPermissions(Permissions.Administrator)
  .setHandler((ctx) => ctx.reply('🔓'));
