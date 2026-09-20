import { Client, SerialTransport } from '@meshcorejs/client';

const client = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  load: import.meta.dirname, // commands/, events/, jobs/, permissions/, roles/, plugins/
});

await client.login();
