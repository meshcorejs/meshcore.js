import { NAME_FIELD_SIZE, type SelfInfo, type SetRadioParamsCommand, utf8ByteLength } from '@meshcorejs/protocol';

export interface RadioParams {
  frequency: number;
  bandwidth: number;
  spreadingFactor: number;
  codingRate: number;
}

export interface Location {
  lat: number;
  lon: number;
}

export const MAX_RADIO_NAME_BYTES = NAME_FIELD_SIZE - 1;
export const MIN_TX_POWER_DBM = -9;

function assertBetween(name: string, value: number, min: number, max: number, integer = false): void {
  const ok = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  if (!ok) {
    throw new RangeError(`${name} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}, got ${value}`);
  }
}

export function assertRadioName(name: string): void {
  const bytes = utf8ByteLength(name);
  if (bytes === 0 || bytes > MAX_RADIO_NAME_BYTES) {
    throw new RangeError(`name must be 1 to ${MAX_RADIO_NAME_BYTES} UTF-8 bytes, got ${bytes}`);
  }
}

export function assertLocation(location: Location): void {
  assertBetween('lat', location.lat, -90, 90);
  assertBetween('lon', location.lon, -180, 180);
}

export function assertTxPower(dbm: number): void {
  assertBetween('txPower', dbm, MIN_TX_POWER_DBM, 127, true);
}

export function assertRadioParams(params: RadioParams): void {
  assertBetween('frequency', params.frequency, 150, 2500);
  assertBetween('bandwidth', params.bandwidth, 7, 500);
  assertBetween('spreadingFactor', params.spreadingFactor, 5, 12, true);
  assertBetween('codingRate', params.codingRate, 5, 8, true);
}

export function toWireParams(params: RadioParams): Omit<SetRadioParamsCommand, 'repeat'> {
  return {
    frequencyKhz: Math.round(params.frequency * 1000),
    bandwidthHz: Math.round(params.bandwidth * 1000),
    spreadingFactor: params.spreadingFactor,
    codingRate: params.codingRate,
  };
}

const micro = (degrees: number) => Math.round(degrees * 1_000_000);

export function sameLocation(location: Location, self: SelfInfo): boolean {
  return micro(location.lat) === micro(self.latitude) && micro(location.lon) === micro(self.longitude);
}

export function sameParams(params: RadioParams, self: SelfInfo): boolean {
  const wire = toWireParams(params);
  return (
    wire.frequencyKhz === self.radio.frequencyKhz &&
    wire.bandwidthHz === self.radio.bandwidthHz &&
    wire.spreadingFactor === self.radio.spreadingFactor &&
    wire.codingRate === self.radio.codingRate
  );
}

export function formatParams(params: RadioParams): string {
  return `${params.frequency} MHz / ${params.bandwidth} kHz / SF${params.spreadingFactor} / CR${params.codingRate}`;
}

export function paramsFromSelf(self: SelfInfo): RadioParams {
  return {
    frequency: self.radio.frequencyKhz / 1000,
    bandwidth: self.radio.bandwidthHz / 1000,
    spreadingFactor: self.radio.spreadingFactor,
    codingRate: self.radio.codingRate,
  };
}
