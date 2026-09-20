import { EventBuilder } from '@meshcorejs/client';

// #region welcome
export default new EventBuilder().setEvent('contactAdd').setHandler(async (_client, contact) => {
  if (contact.type === 'chat') await contact.send('👋 Welcome to the club mesh. Send /help to see what I can do');
});
// #endregion welcome

// #region advert
export const heard = new EventBuilder().setEvent('advert').setHandler((client, advert) => {
  client.logger.info(`heard ${advert.name}${advert.contact ? '' : ' (not in contacts)'}`);
});
// #endregion advert
