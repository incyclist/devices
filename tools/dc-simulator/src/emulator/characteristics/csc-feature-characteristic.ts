import { Characteristic } from './characteristic.js';
import { TValue } from '../types.js';

interface TCscFeature extends TValue {
  wheel_revolution_supported?: boolean;
  crank_revolution_supported?: boolean;
  multiple_locations_supported?: boolean;
}

export class CscFeatureCharacteristic extends Characteristic<TCscFeature> {

  constructor(features?: TCscFeature) {
    super({
      uuid: '2A5C',
      value: null,
      properties: ['read'],
      descriptors: [
        { uuid: '2901', value: 'CSC Feature' }
      ]
    });
    this.description = 'CSC Feature';

    // Set default features if provided
    if (features) {
      this.update(features);
    } else {
      // Default: both wheel and crank supported
      this.setDefaultFeatures();
    }
  }

  private setDefaultFeatures(): void {
    const buffer = Buffer.alloc(2);
    let flags = 0;
    flags |= 0x01; // Wheel Revolution Data Supported
    flags |= 0x02; // Crank Revolution Data Supported
    buffer.writeUInt16LE(flags, 0);
    this.value = buffer;
    this.data = {
      wheel_revolution_supported: true,
      crank_revolution_supported: true,
      multiple_locations_supported: false
    };
  }

  update(event: TCscFeature): void {
    const buffer = Buffer.alloc(2);
    let flags = 0;

    if (event.wheel_revolution_supported) {
      flags |= 0x01;
    }
    if (event.crank_revolution_supported) {
      flags |= 0x02;
    }
    if (event.multiple_locations_supported) {
      flags |= 0x04;
    }

    buffer.writeUInt16LE(flags, 0);
    this.value = buffer;
    this.data = event;
  }
}
