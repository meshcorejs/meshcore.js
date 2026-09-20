import { CommandBuilder } from '@meshcorejs/client';

export default new CommandBuilder()
  .setName('hello')
  .setDescription('Say hello')
  .setHandler((ctx) => ctx.reply(`Hello ${ctx.author.name}, I am ${ctx.client.self.name}`));
