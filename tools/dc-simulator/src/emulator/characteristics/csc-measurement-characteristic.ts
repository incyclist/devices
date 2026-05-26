import { Characteristic } from './characteristic.js';
import { TValue } from '../types.js';

interface TCscMeasurement extends TValue {
  wheel_revolutions?: number;
  wheel_event_time?: number;
  crank_revolutions?: number;
  crank_event_time?: number;
}

export class CscMeasurementCharacteristic extends Characteristic<TCscMeasurement> {

  constructor() {
    super({
      uuid: '2A5B',
      value: null,
      properties: ['notify'],
      descriptors: [
        { uuid: '2901', value: 'CSC Measurement' },
        { uuid: '2902', value: Buffer.alloc(2) }  // Client Characteristic Configuration
      ]
    });
    this.description = 'CSC Measurement';
  }

  update(event: TCscMeasurement): void {
    let bufferSize = 1; // flags byte
    let flags = 0;

    if ('wheel_revolutions' in event && 'wheel_event_time' in event) {
      flags |= 0x01; // Wheel Revolution Data Present
      bufferSize += 6;
    }

    if ('crank_revolutions' in event && 'crank_event_time' in event) {
      flags |= 0x02; // Crank Revolution Data Present
      bufferSize += 4;
    }

    const buffer = Buffer.alloc(bufferSize);
    let offset = 0;

    // Write flags
    buffer.writeUInt8(flags, offset);
    offset += 1;

    // Write Wheel Revolution Data
    if ('wheel_revolutions' in event && 'wheel_event_time' in event) {
      buffer.writeUInt32LE(event.wheel_revolutions % 4294967296, offset);
      offset += 4;
      buffer.writeUInt16LE(event.wheel_event_time % 65536, offset);
      offset += 2;
    }

    // Write Crank Revolution Data
    if ('crank_revolutions' in event && 'crank_event_time' in event) {
      buffer.writeUInt16LE(event.crank_revolutions, offset);
      offset += 2;
      buffer.writeUInt16LE(event.crank_event_time, offset);
      offset += 2;
    }

    this.value = buffer;
    this.data = event;
  }
}
