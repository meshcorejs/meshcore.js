import { CommandBuilder } from '../../../../src/index.js';

export default new CommandBuilder().setName('ping').setHandler((ctx) => ctx.reply('pong'));
