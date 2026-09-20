// #region tcp
import { encodeAppStart } from '@meshcorejs/protocol';
import { TcpTransport } from '@meshcorejs/transports';

const transport = new TcpTransport({ host: '192.168.1.50' });

transport.on('frame', (payload) => {
  console.log(`received a ${payload.length}-byte frame`);
});
transport.on('close', (error) => {
  console.log('TCP connection lost unexpectedly', error?.message);
});

await transport.connect();
await transport.write(encodeAppStart('MyBot'));
// #endregion tcp
