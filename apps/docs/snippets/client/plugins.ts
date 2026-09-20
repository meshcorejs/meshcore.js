// #region runtime
import { Client, SerialTransport } from '@meshcorejs/client';

const client = new Client({ transport: new SerialTransport({ path: '/dev/ttyACM0' }) });

client.on('pluginLoad', (plugin) => console.log(`${plugin.name} loaded (${plugin.bricks.length} bricks)`));
client.on('pluginUnload', (plugin) => console.log(`${plugin.name} unloaded`));
client.on('error', (error, source) => {
  if (source.type === 'plugin') console.error(`plugin "${source.name}" failed:`, error);
});

await client.login();

const weather = client.plugins.get('weather');
console.log(weather?.state); // 'pending' | 'loaded' | 'unloaded'
await weather?.unload();
await weather?.load();
await weather?.reload();
// #endregion runtime
