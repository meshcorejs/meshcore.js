// #region construct
import { Client, createConsoleLogger, SerialTransport } from '@meshcorejs/client';

const client = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  load: import.meta.dirname,
  logger: createConsoleLogger(),
  appName: 'ClubBot',
});
// #endregion construct

// #region events
client.on('messageCreate', (message) => {
  console.log(`${message.author.name}: ${message.content}`);
});

client.on('error', (error, source) => {
  console.error(`[${source.type}${source.name ? ` ${source.name}` : ''}]`, error);
});
// #endregion events

await client.login();

// #region destroy
process.on('SIGINT', () => {
  void client.destroy();
});
// #endregion destroy
