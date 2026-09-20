// #region main
import { Client, SerialTransport } from '@meshcorejs/client';

const client = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  load: import.meta.dirname,
});

await client.login();
// #endregion main
