// #region serial
import { encodeAppStart } from '@meshcorejs/protocol';
import { SerialTransport } from '@meshcorejs/transports';

const transport = new SerialTransport({ path: '/dev/ttyACM0' });

transport.on('frame', (payload) => {
  console.log(`received a ${payload.length}-byte frame`);
});
transport.on('close', (error) => {
  console.log('serial port lost unexpectedly', error?.message);
});

await transport.connect();
await transport.write(encodeAppStart('MyBot'));
// #endregion serial
