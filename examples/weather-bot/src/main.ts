import { Client, RadioConfig, SerialTransport } from '@meshcorejs/client';
import { config } from './config.js';

const client = new Client({
  transport: new SerialTransport({ path: process.env.MESH_SERIAL ?? '/dev/ttyACM0' }),
  radio: new RadioConfig({ name: 'WeatherBot', location: config.location }),
  load: import.meta.dirname,
});

client.on('ready', async () => {
  console.log(`🌤 ${client.self.name} ready: ${client.commands.size} commands, ${client.plugins.size} plugin(s)`);
  console.log(`   public key: ${client.self.publicKey}`);
  const contacts = client.contacts.cache.map((c) => c.name).join(', ');
  console.log(`   contacts: ${contacts || 'none'}${client.self.manualAddContacts ? ' (manual add)' : ''}`);
  const channels = client.channels.cache.map((c) => `${c.index}:${c.name}`).join(', ');
  console.log(`   channels on the radio: ${channels || 'none'} (bulletin on ${config.channel})`);
  const { uri } = await client.radio.exportSelfContact();
  console.log(`   contact card: ${uri}`);
});

client.on('contactAdd', (contact) => console.log(`👤 new contact ${contact.name} (${contact.type})`));
client.on('advert', (advert) => console.log(`📡 advert from ${advert.name || advert.publicKey.slice(0, 12)}`));
client.on('messageCreate', (message) => {
  const where = message.isDM ? 'DM' : (message.channel?.name ?? 'channel');
  console.log(`📨 ${where} from ${message.author.name}${message.backlog ? ' (backlog)' : ''}: ${message.content}`);
});
client.on('commandDenied', (ctx, reason) =>
  console.warn(`⛔ ${ctx.author.name} → ${ctx.command?.name ?? '?'}: ${reason.type}`),
);
client.on('error', (error, source) => console.error(`[${source.type}${source.name ? ` ${source.name}` : ''}]`, error));

await client.login();

process.on('SIGINT', async () => {
  await client.destroy();
  process.exit(0);
});
