import { Characteristic } from "../base";
import { TValue } from "../types";


// function bit(nr) {
//   return (1 << nr);
// }

//const HeartRateValueFormat = bit(0);
const HeartRateValueFormatUint8 = 0;
//const HeartRateValueFormatUint16 = HeartRateValueFormat;

export interface HeartRateMeasurement extends TValue {
    heart_rate: number
}

export class HeartRateMeasurementCharacteristic extends  Characteristic<HeartRateMeasurement> {

  constructor() {
    super({
      uuid: '2A37',
      value:null,
      properties: ['notify'],
      descriptors: [{ uuid: '2901',value: 'Heart Rate Measurement'}]
    });
    
  }

  
  update(event) {
    const buffer = Buffer.alloc(2);
    if ('heart_rate' in event) {

      buffer.writeUInt8(HeartRateValueFormatUint8, 0);
      buffer.writeUInt8(event.heart_rate, 1);
    }

    this.value = buffer
    this.data = event
  }
};