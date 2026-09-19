import type { SelfInfo } from '@meshcorejs/protocol';
import { describe, expect, it } from 'vitest';
import { RadioConfigError } from '../src/errors.js';
import { RadioConfig } from '../src/radio/radio-config.js';

const self = {
  name: 'TrainBot',
  latitude: 43.6045,
  longitude: 1.4442,
  txPowerDbm: 22,
  maxTxPowerDbm: 22,
  radio: { frequencyKhz: 869525, bandwidthHz: 250000, spreadingFactor: 11, codingRate: 5 },
} as SelfInfo;

describe('RadioConfig', () => {
  it('accepts an empty configuration and touches nothing', () => {
    const config = new RadioConfig({});
    expect(config.name).toBeUndefined();
    expect(config.diff(self)).toEqual([]);
  });

  it('treats an explicit undefined like an absent field', () => {
    const config = new RadioConfig({ name: undefined, txPower: undefined, location: undefined, params: undefined });
    expect(config.name).toBeUndefined();
    expect(config.diff(self)).toEqual([]);
  });

  it('validates each declared field at construction', () => {
    expect(() => new RadioConfig({ name: '' })).toThrow(RangeError);
    expect(() => new RadioConfig({ location: { lat: 95, lon: 0 } })).toThrow(/lat/);
    expect(() => new RadioConfig({ txPower: -10 })).toThrow(/txPower/);
    expect(
      () => new RadioConfig({ params: { frequency: 100, bandwidth: 250, spreadingFactor: 11, codingRate: 5 } }),
    ).toThrow(/frequency/);
  });

  it('is frozen', () => {
    const config = new RadioConfig({ name: 'TrainBot', location: { lat: 1, lon: 2 } });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.location)).toBe(true);
  });

  it('reports only the settings that differ from the radio, in a fixed order', () => {
    const same = new RadioConfig({
      name: 'TrainBot',
      location: { lat: 43.6045, lon: 1.4442 },
      txPower: 22,
      params: { frequency: 869.525, bandwidth: 250, spreadingFactor: 11, codingRate: 5 },
    });
    expect(same.diff(self)).toEqual([]);

    const different = new RadioConfig({
      params: { frequency: 868, bandwidth: 250, spreadingFactor: 11, codingRate: 5 },
      txPower: 14,
      name: 'ClubBot',
    });
    expect(different.diff(self)).toEqual(['name', 'txPower', 'params']);
  });
});

describe('RadioConfigError', () => {
  it('carries the setting and the radio code', () => {
    const error = new RadioConfigError('txPower', 'txPower 30 dBm exceeds the radio maximum (22 dBm)');
    expect(error.code).toBe('RADIO_CONFIG_REJECTED');
    expect(error.setting).toBe('txPower');
    expect(error.radioCode).toBeNull();
    expect(new RadioConfigError('params', 'radio rejected params', 6).radioCode).toBe(6);
  });
});
