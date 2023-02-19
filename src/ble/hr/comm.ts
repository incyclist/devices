import { BleComms } from '../ble-comms';
import { HrmData } from './types';

export default class BleHrmDevice extends BleComms {
    static services =  ['180d'];
    static characteristics =  ['2a37', '2a38', '2a39', '2a3c'];
    static detectionPriority = 1;
    
    heartrate: number;
    rr: number;

    constructor(props?) {
        super(props);
        this.heartrate = undefined
        this.rr = undefined
    }

    getProfile(): string {
        return 'Heartrate Monitor';
    }
  

    getServiceUUids(): string[] {
        return BleHrmDevice.services;
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


        if (characteristic.toLocaleLowerCase() === '2a37') { //  name: 'Heart Rate Measurement',
            const res = this.parseHrm(data)
            this.emit('data', res)
            return false;
        }

        return true;
  
    }

}

