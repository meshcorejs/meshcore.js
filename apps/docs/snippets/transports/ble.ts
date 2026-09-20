// #region ble
import { encodeAppStart } from '@meshcorejs/protocol';
import { BleTransport } from '@meshcorejs/transports';

const transport = new BleTransport({ name: 'MeshCore-1234' });

transport.on('frame', (payload) => {
  console.log(`received a ${payload.length}-byte frame`);
});
transport.on('close', (error) => {
  console.log('BLE device disconnected unexpectedly', error?.message);
});

await transport.connect();
await transport.write(encodeAppStart('MyBot'));
// #endregion ble
