import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";


/*
export interface HeartRateMeasurement extends TValue {
    heart_rate: number
}
    */

export class ZwiftPlayResponseCharacteristic extends  Characteristic<TValue> {

  constructor() {
    super({
      uuid: '00000004-19ca-4651-86e5-fa29dcdd09d1',
      value:null,
      properties: ['indicate'],
      descriptors: [{ uuid: '2902',value: 'Response'}]
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

  send(message:Buffer) {

    console.log('# zwift-play send response',message.toString('hex') )
    this.value = message
    this.emitter.emit('notification', message)
  }

};