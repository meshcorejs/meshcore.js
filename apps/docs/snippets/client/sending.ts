import { Client, MessageBuilder, SerialTransport } from '@meshcorejs/client';

const client = new Client({ transport: new SerialTransport({ path: '/dev/ttyACM0' }) });
await client.login();

// #region send
const contact = client.contacts.get('a1b2c3d4');
if (contact) await contact.send('back at the base by 18:00');

const channel = client.channels.get('general');
if (channel) await channel.send('weather updated for tomorrow');

client.on('messageCreate', async (message) => {
  await message.reply('got it');
});
// #endregion send

// #region builder
const forecast = new MessageBuilder()
  .setTitle('📍 Club site')
  .addLine('Today 18°/24°, rain 10%')
  .addField('Wind', '12 km/h NW')
  .setFooter('Updated 08:00')
  .setOverflow('split', { maxParts: 3 });

const { bytes, limit, parts } = forecast.measure();
console.log(`${bytes}/${limit} bytes, ${parts} part(s)`);
// #endregion builder

// #region delivery
if (contact) {
  const sent = await contact.send('on my way');
  console.log(sent.status); // 'queued' | 'sent' | 'delivered' | 'failed'
  await sent.delivered();
}

client.on('messageDelivered', (sent) => {
  console.log(`delivered: ${sent.parts.join(' / ')}`);
});
client.on('messageFailed', (sent, error) => {
  console.log(`delivery failed (${error.reason}): ${sent.parts.join(' / ')}`);
});
// #endregion delivery
