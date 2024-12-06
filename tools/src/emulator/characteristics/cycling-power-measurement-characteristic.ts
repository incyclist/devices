import { Characteristic } from '../base';
import { TValue } from '../types';


// Spec
// https://developer.bluetooth.org/gatt/characteristics/Pages/CharacteristicViewer.aspx?u=org.bluetooth.characteristic.cycling_power_measurement.xml

interface TCyclingPowerMeasurement extends TValue {
    watts?: number;
    rev_count?: number;
    wheel_count?: number;
    heart_rate?: number;
    spd_int?:number
    cad_time?:number
    cadence?: number;
    powerMeterSpeed:number
    wheel_time?:number
}


export class CyclingPowerMeasurementCharacteristic extends Characteristic<TCyclingPowerMeasurement> {

  constructor() {
    super({
      uuid: '2A63',
      value: null,
      properties: ['notify'],
      descriptors: [
        {uuid: '2901',value: 'Cycling Power Measurement'},
        {uuid: '2902',value: Buffer.alloc(2)},  // Client Characteristic Configuration,
        {uuid: '2903',value: Buffer.alloc(2)}   // Server Characteristic Configuration
      ]
    });
    this.description = 'Cycling Power Measurement';
  }



  update(event: TCyclingPowerMeasurement): void {

    const buffer = Buffer.alloc(14);
    let offset = 0;
    // flags
    // 00000001 - 1   - 0x01 - Pedal Power Balance Present
    // 00000010 - 2   - 0x02 - Pedal Power Balance Reference
    // 00000100 - 4   - 0x04 - Accumulated Torque Present
    // 00001000 - 8   - 0x08 - Accumulated Torque Source
    // 00010000 - 16  - 0x10 - Wheel Revolution Data Present
    // 00100000 - 32  - 0x20 - Crank Revolution Data Present
    // 01000000 - 64  - 0x40 - Extreme Force Magnitudes Present
    // 10000000 - 128 - 0x80 - Extreme Torque Magnitudes Present
    if (('rev_count' in event) && ('wheel_count' in event)) {
      buffer.writeUInt16LE(0x30, offset);
    } else if (('rev_count' in event) && !('wheel_count' in event)) {
      buffer.writeUInt16LE(0x20, offset);
    } else {
      buffer.writeUInt16LE(0x00, offset);
    }

    if ('watts' in event) {
      const watts = event.watts;
      offset += 2;
      buffer.writeInt16LE(watts, offset);
    }

    // Speed
    if ('wheel_count' in event) {
      offset += 2;
      event.wheel_count = event.wheel_count % 65536;

      buffer.writeUInt32LE(event.wheel_count, offset);

      const wheel_time = (event.wheel_count * event.spd_int) % 65536;
      offset += 4;
      buffer.writeUInt16LE(wheel_time, offset);
    }

    // Cadence
    if ('rev_count' in event) {
      offset += 2;
      event.rev_count = event.rev_count % 65536;

      buffer.writeUInt16LE(event.rev_count, offset);

      offset += 2;
      buffer.writeUInt16LE(event.cad_time, offset);
    }

    this.value = buffer
    this.data = event
  }

}

