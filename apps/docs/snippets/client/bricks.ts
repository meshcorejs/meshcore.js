// #region load
import { Client, RadioConfig, SerialTransport } from '@meshcorejs/client';

const bot = new Client({
  transport: new SerialTransport({ path: process.env.MESH_SERIAL ?? '/dev/ttyACM0' }),
  radio: new RadioConfig({ name: 'ClubBot' }),
  load: import.meta.dirname,
});

await bot.login();

// #endregion load

// #region register
import { CommandBuilder } from '@meshcorejs/client';

bot.register(
  new CommandBuilder()
    .setName('ping')
    .setDescription('Check the bot is alive')
    .setHandler((ctx) => ctx.reply('pong')),
);
// #endregion register
