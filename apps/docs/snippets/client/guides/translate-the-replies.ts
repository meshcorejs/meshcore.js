import { Client, frenchReplies, SerialTransport } from '@meshcorejs/client';

// #region french
const client = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  replies: frenchReplies,
});
// #endregion french

await client.login();

// #region partial
const club = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  replies: {
    ...frenchReplies,
    unknownCommandDM: '❓ Commande inconnue, essaie /help',
    cooldown: (seconds) => `⏳ Encore ${seconds}s`,
  },
});
// #endregion partial

await club.login();
