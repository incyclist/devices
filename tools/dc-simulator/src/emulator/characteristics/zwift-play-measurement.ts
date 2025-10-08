import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";


/*
export interface HeartRateMeasurement extends TValue {
    heart_rate: number
}
    */

export class ZwiftPlayMeasurementCharacteristic extends  Characteristic<TValue> {

  constructor() {
    super({
      uuid: '00000002-19ca-4651-86e5-fa29dcdd09d1',
      value:null,
      properties: ['notify'],
      descriptors: [{ uuid: '2902',value: 'Command'}]
    });
    
  }

  
  update( /*_event:any*/) {
    /*
    const buffer = Buffer.alloc(2);
    if ('heart_rate' in event) {

      buffer.writeUInt8(HeartRateValueFormatUint8, 0);
      buffer.writeUInt8(event.heart_rate, 1);
    }

    this.value = buffer
    this.data = event
    */

    // TODO
  }
};