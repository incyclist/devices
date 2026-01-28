import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";
import {HubRidingData} from 'incyclist-devices'


export interface ZwiftPlayUpdate extends TValue {
    power?: number
    heartrate?: number
    cadence?:number,
    speed?:number
}


export class ZwiftPlayMeasurementCharacteristic extends  Characteristic<TValue> {

  protected tsLastUpdate

  constructor() {
    super({
      uuid: '00000002-19ca-4651-86e5-fa29dcdd09d1',
      value:null,
      properties: ['notify'],
      descriptors: [{ uuid: '2902',value: 'Command'}]
    });
    
  }

  
  update( event:ZwiftPlayUpdate) {

    const power = event.power ?? 0
    const cadence = event.cadence ?? 0
    const speedX100 = Math.round(event.speed??0)*100
    const hR = event.heartrate
    const unknown1 = speedX100>0 ? 8123 : 0
    const unknown2 = 29159

    const data:HubRidingData ={power,cadence,speedX100,hR,unknown1,unknown2}

    this.value = Buffer.concat( [
      Buffer.from('03','hex'),
      Buffer.from( HubRidingData.toBinary(data)) 
    ])
    this.data = event

  }

  notify():void { 
    if (!this.value)
      return

    const tsNow = Date.now()
    const delta = tsNow-(this.tsLastUpdate??0)
    if (delta<1000) {
      return
    }

    console.log('# zwift-play notify',delta, this.value?.toString('hex'))
    super.notify()
    this.tsLastUpdate = tsNow
  }

  send(message:Buffer) {

    console.log('# zwift-play-send',message.toString('hex') )
    this.value = message
    this.emitter.emit('notification', message)
  }

};