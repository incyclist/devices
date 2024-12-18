import { LegacyProfile } from '../../antv2/types';
import { TBleSensor } from '../base/sensor';
import { HR_MEASUREMENT } from '../consts';
import { BleProtocol } from '../types';
import { matches } from '../utils';
import { HrmData } from './types';

export default class BleHrmDevice extends TBleSensor {
    static readonly profile:LegacyProfile  ='Heartrate Monitor'
    static readonly protocol:BleProtocol = 'hr'
    static readonly services =  ['180d'];
    static readonly characteristics =  [HR_MEASUREMENT, '2a38', '2a39', '2a3c'];
    static readonly detectionPriority = 1;
    
    protected heartrate: number;
    protected rr: number;

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

    reset(){
        delete this.heartrate;
        delete this.rr
    }

    protected getRequiredCharacteristics():Array<string> {
        return [HR_MEASUREMENT]
    }

    onData(characteristic:string,data: Buffer):boolean {       
        const hasData = super.onData(characteristic,data);
        if (!hasData)
            return;

        if ( matches(characteristic,HR_MEASUREMENT)) { 
            const res = this.parseHrm(data)
            this.emit('data', res)
            return false;
        }

        return true;
    }

}

