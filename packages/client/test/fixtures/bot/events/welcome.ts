import { EventBuilder } from '../../../../src/index.js';

export default new EventBuilder().setEvent('contactAdd').setHandler(async (_client, contact) => {
  await contact.send(`👋 Bienvenue ${contact.name}`);
});
