// #region mock
import { Client, CommandBuilder } from '@meshcorejs/client';
import { FakeRadio, fakeContactRecord, MockTransport } from '@meshcorejs/transports/mock';

const alice = fakeContactRecord({ name: 'Alice' });

const transport = new MockTransport();
const radio = new FakeRadio({ self: { name: 'MockBot' }, contacts: [alice] }).attach(transport);

const client = new Client({ transport });
client.register(
  new CommandBuilder()
    .setName('ping')
    .setDescription('Check the bot is alive')
    .setHandler((ctx) => ctx.reply('pong')),
);

await client.login();

// Drive the radio directly instead of using real hardware.
radio.receiveContactMessage({ from: alice.publicKey, text: '/ping' });
console.log(radio.sent);
// #endregion mock
