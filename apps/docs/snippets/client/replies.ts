import { Client, frenchReplies, SerialTransport } from '@meshcorejs/client';

// #region french
const client = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  replies: frenchReplies,
});
// #endregion french

console.log(client.replies.unknownCommandDM);

// #region partial
const client2 = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  replies: {
    unknownCommandDM: '❓ Commande introuvable, tape /help',
    cooldown: (seconds) => `⏳ Patiente encore ${seconds}s`,
  },
});
// #endregion partial

console.log(client2.replies.cooldown(5));
