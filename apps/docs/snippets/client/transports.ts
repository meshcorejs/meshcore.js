import { BleTransport, Client, SerialTransport, TcpTransport } from '@meshcorejs/client';

// #region serial
const serial = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }), // COM3 on Windows
  load: import.meta.dirname,
});
// #endregion serial

// #region tcp
const tcp = new Client({
  transport: new TcpTransport({ host: '192.168.1.50' }), // port 5000 unless the radio says otherwise
  load: import.meta.dirname,
});
// #endregion tcp

// #region ble
const ble = new Client({
  transport: new BleTransport({ name: 'ClubBot' }), // or { address: 'aa:bb:cc:dd:ee:ff' }
  load: import.meta.dirname,
});
// #endregion ble

await serial.login();
await tcp.login();
await ble.login();
