// #region config
import { Client, RadioConfig, RadioError, SerialTransport } from '@meshcorejs/client';

const client = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  radio: new RadioConfig({
    name: 'TrainBot',
    txPower: 22,
    location: { lat: 43.6045, lon: 1.4442 },
    params: { frequency: 869.525, bandwidth: 250, spreadingFactor: 11, codingRate: 5 },
  }),
});
// #endregion config

await client.login();

// #region runtime
try {
  await client.radio.setTxPower(20);
} catch (error) {
  if (error instanceof RangeError) console.error('invalid value:', error.message);
  else if (error instanceof RadioError) console.error('radio refused it:', error.message);
  else throw error;
}
// #endregion runtime
