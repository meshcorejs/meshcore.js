import { CommandBuilder, PluginBuilder } from '../../../../src/index.js';

export default new PluginBuilder()
  .setName('faq')
  .setDescription('Fixed answers')
  .addBricks(new CommandBuilder().setName('horaires').setHandler((ctx) => ctx.reply('Lun–Ven 7h–19h')));
