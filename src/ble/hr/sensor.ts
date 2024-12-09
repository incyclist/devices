import { LegacyProfile } from '../../antv2/types';
import { BleSensor } from '../base/sensor';
import { HR_MEASUREMENT } from '../consts';
import { BleProtocol } from '../types';
import { beautifyUUID, matches, uuid } from '../utils';
import { HrmData } from './types';

export default class BleHrmDevice extends BleSensor {
    static readonly protocol:BleProtocol = 'hr'
    static readonly services =  ['180d'];
    static readonly characteristics =  [HR_MEASUREMENT, '2a38', '2a39', '2a3c'];
    static readonly detectionPriority = 1;
    
    heartrate: number;
    rr: number;

    getProfile(): LegacyProfile {
        return 'Heartrate Monitor';
    }

    getProtocol(): BleProtocol {
        return BleHrmDevice.protocol
    }
  

    getServiceUUids(): string[] {
        return BleHrmDevice.services;
    }

    isMatching(serviceUUIDs: string[]): boolean {             
        const uuids = serviceUUIDs.map( uuid=>beautifyUUID(uuid))
        return uuids.includes(beautifyUUID('180d'));
    }


    parseHrm(_data: Uint8Array):HrmData { 
        const data = Buffer.from(_data);

        try {                         
            const flags = data.readUInt8(0);

            let offset = 2;

            if ( flags % 1 === 0) { 
                this.heartrate = data.readUInt8(1);
            }
            else {
                this.heartrate = data.readUInt16LE(1);
                offset = 3
            }
            if ( flags % 0xF) {
                this.rr = (data.readUInt16LE(offset))/1024
            }
        }
        catch (err) { 

        }
        const {heartrate, rr} = this

        return {heartrate, rr,raw:data.toString('hex')}
    }

    onData(characteristic:string,data: Buffer):boolean {
        
        const hasData = super.onData(characteristic,data);
        if (!hasData)
            return;


        if ( matches(characteristic.toLocaleLowerCase(),'2a37')) { //  name: 'Heart Rate Measurement',
            const res = this.parseHrm(data)
            this.emit('data', res)
            return false;
        }

        return true;
  
    }

}

