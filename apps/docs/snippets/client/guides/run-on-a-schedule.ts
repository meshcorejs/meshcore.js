import { JobBuilder } from '@meshcorejs/client';

// #region advert
export default new JobBuilder()
  .setName('advert')
  .setInterval(6 * 3600)
  .setRunOnStart()
  .setHandler((client) => client.radio.sendSelfAdvert(true));
// #endregion advert

// #region evening
export const evening = new JobBuilder()
  .setName('evening-report')
  .setCron('0 20 * * *', { timezone: 'Europe/Paris' })
  .setHandler(async (client) => {
    const today = Date.now() - 86_400_000;
    const heard = client.contacts.cache.filter((contact) => contact.lastSeen.getTime() > today).size;
    await client.channels.get('#club')?.send(`📡 ${heard} nodes heard today`);
  });
// #endregion evening
