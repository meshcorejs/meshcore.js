import type { SelfInfo } from '@meshcorejs/protocol';
import {
  assertLocation,
  assertRadioName,
  assertRadioParams,
  assertTxPower,
  type Location,
  type RadioParams,
  sameLocation,
  sameParams,
} from './radio-settings.js';

export type RadioSetting = 'name' | 'location' | 'txPower' | 'params';

export interface RadioConfigOptions {
  name?: string | undefined;
  location?: Location | undefined;
  txPower?: number | undefined;
  params?: RadioParams | undefined;
}

export class RadioConfig {
  readonly name?: string;
  readonly location?: Readonly<Location>;
  readonly txPower?: number;
  readonly params?: Readonly<RadioParams>;

  /** @param options name, location, txPower and params. Absent fields are never touched */
  constructor(options: RadioConfigOptions) {
    if (options.name !== undefined) {
      assertRadioName(options.name);
      this.name = options.name;
    }
    if (options.location !== undefined) {
      assertLocation(options.location);
      this.location = Object.freeze({ lat: options.location.lat, lon: options.location.lon });
    }
    if (options.txPower !== undefined) {
      assertTxPower(options.txPower);
      this.txPower = options.txPower;
    }
    if (options.params !== undefined) {
      assertRadioParams(options.params);
      this.params = Object.freeze({ ...options.params });
    }
    Object.freeze(this);
  }

  /** @param self What the radio reports */
  diff(self: SelfInfo): RadioSetting[] {
    const changes: RadioSetting[] = [];
    if (this.name !== undefined && this.name !== self.name) changes.push('name');
    if (this.location !== undefined && !sameLocation(this.location, self)) changes.push('location');
    if (this.txPower !== undefined && this.txPower !== self.txPowerDbm) changes.push('txPower');
    if (this.params !== undefined && !sameParams(this.params, self)) changes.push('params');
    return changes;
  }
}
