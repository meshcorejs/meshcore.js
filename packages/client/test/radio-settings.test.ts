import type { SelfInfo } from '@meshcorejs/protocol';
import { describe, expect, it } from 'vitest';
import {
  assertLocation,
  assertRadioName,
  assertRadioParams,
  assertTxPower,
  sameLocation,
  sameParams,
  toWireParams,
} from '../src/radio/radio-settings.js';

const self = {
  latitude: 43.6045,
  longitude: 1.4442,
  radio: { frequencyKhz: 869525, bandwidthHz: 250000, spreadingFactor: 11, codingRate: 5 },
} as SelfInfo;

describe('radio settings validation', () => {
  it('accepts names of 1 to 31 UTF-8 bytes', () => {
    expect(() => assertRadioName('TrainBot')).not.toThrow();
    expect(() => assertRadioName('')).toThrow(/name/);
    expect(() => assertRadioName('é'.repeat(16))).toThrow(/31/);
  });

  it('checks coordinates', () => {
    expect(() => assertLocation({ lat: 43.6, lon: 1.4 })).not.toThrow();
    expect(() => assertLocation({ lat: 91, lon: 0 })).toThrow(/lat/);
    expect(() => assertLocation({ lat: 0, lon: 181 })).toThrow(/lon/);
  });

  it('checks tx power', () => {
    expect(() => assertTxPower(22)).not.toThrow();
    expect(() => assertTxPower(-9)).not.toThrow();
    expect(() => assertTxPower(-10)).toThrow(/txPower/);
    expect(() => assertTxPower(22.5)).toThrow(/txPower/);
  });

  it('checks LoRa params in app units', () => {
    const ok = { frequency: 869.525, bandwidth: 250, spreadingFactor: 11, codingRate: 5 };
    expect(() => assertRadioParams(ok)).not.toThrow();
    expect(() => assertRadioParams({ ...ok, frequency: 149.999 })).toThrow(/frequency/);
    expect(() => assertRadioParams({ ...ok, frequency: 2500.001 })).toThrow(/frequency/);
    expect(() => assertRadioParams({ ...ok, bandwidth: 6.9 })).toThrow(/bandwidth/);
    expect(() => assertRadioParams({ ...ok, bandwidth: 500.1 })).toThrow(/bandwidth/);
    expect(() => assertRadioParams({ ...ok, spreadingFactor: 4 })).toThrow(/spreadingFactor/);
    expect(() => assertRadioParams({ ...ok, spreadingFactor: 11.5 })).toThrow(/spreadingFactor/);
    expect(() => assertRadioParams({ ...ok, codingRate: 9 })).toThrow(/codingRate/);
  });

  it('converts to wire units', () => {
    expect(toWireParams({ frequency: 869.525, bandwidth: 250, spreadingFactor: 11, codingRate: 5 })).toEqual({
      frequencyKhz: 869525,
      bandwidthHz: 250000,
      spreadingFactor: 11,
      codingRate: 5,
    });
  });

  it('compares against SelfInfo at wire precision', () => {
    expect(sameLocation({ lat: 43.6045, lon: 1.4442 }, self)).toBe(true);
    expect(sameLocation({ lat: 43.6045004, lon: 1.4442 }, self)).toBe(true); // below 1e-6
    expect(sameLocation({ lat: 43.6046, lon: 1.4442 }, self)).toBe(false);
    expect(sameParams({ frequency: 869.525, bandwidth: 250, spreadingFactor: 11, codingRate: 5 }, self)).toBe(true);
    expect(sameParams({ frequency: 868, bandwidth: 250, spreadingFactor: 11, codingRate: 5 }, self)).toBe(false);
  });
});
