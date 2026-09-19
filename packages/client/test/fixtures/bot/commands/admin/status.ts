import { CommandBuilder } from '../../../../../src/index.js';

export default new CommandBuilder()
  .setName('status')
  .setScope('dm')
  .setHandler((ctx) => ctx.reply('ok'));
