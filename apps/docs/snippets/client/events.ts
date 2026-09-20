import { Client, EventBuilder, SerialTransport } from '@meshcorejs/client';

// #region handler
export default new EventBuilder()
  .setEvent('ready')
  .setOnce()
  .setHandler((client) => {
    console.log(`${client.self.name} is ready`);
  });
// #endregion handler

// #region isolation
export const welcome = new EventBuilder().setEvent('contactAdd').setHandler((_client, contact) => {
  throw new Error(`could not welcome ${contact.name}`);
});

export const log = new EventBuilder().setEvent('contactAdd').setHandler((_client, contact) => {
  console.log(`still runs for ${contact.name}`);
});
// #endregion isolation

const client = new Client({ transport: new SerialTransport({ path: '/dev/ttyACM0' }) });

// #region errors
client.on('error', (error, source) => {
  if (source.type === 'event') console.error(`event "${source.name}" failed:`, error);
});
// #endregion errors
