import { JobBuilder } from '@meshcorejs/client';

export default new JobBuilder()
  .setName('morning')
  .setCron('0 7 * * 1-5', { timezone: 'Europe/Paris' })
  .setHandler(async (client) => {
    await client.channels.get('#lyon')?.send('☀️ bonjour');
  });
