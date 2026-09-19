import { EventBuilder } from '@meshcorejs/client';

export default new EventBuilder().setEvent('contactAdd').setHandler(async (_client, contact) => {
  if (contact.type === 'chat') await contact.send(`👋 Welcome ${contact.name}! Send /help to see what I can do`);
});
