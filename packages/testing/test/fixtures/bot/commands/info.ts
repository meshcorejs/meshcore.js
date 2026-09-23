import { CommandBuilder } from '@meshcorejs/client';

export default new CommandBuilder()
  .setName('info')
  .setDescription('Who I am, allowed on Public')
  .setScope('dm', 'channel', 'public')
  .setHandler((ctx) => ctx.reply('TrainBot · /help in DM'));
