import { BleDevice } from './ble-device';
import BleInterface from './ble-interface';


type PowerData = {
    instantaneousPower?: number;
    balance?: number;
    accTorque?: number;
    rpm: number;
    raw?: Buffer
}

type CrankData = {
    revolutions?: number,
    time?: number,
    cntUpdateMissing?: number,
}

export default class BleCyclingPowerDevice extends BleDevice {
    static services =  ['1818'];
    static characteristics =  [ '2a63', '2a65', '2a5d', '2a3c' ];
    
    instantaneousPower: number = undefined;
    balance: number = undefined;
    accTorque:number = undefined;
    currentCrankData: CrankData = undefined
    prevCrankData: CrankData = undefined
    rpm: number = undefined
    

    /*
    constructor(props?) {
        super(props);
        
        this.instantaneousPower = undefined;
        balance: number;
        accTorque: number;
    
    }
    */

    getProfile(): string {
        return 'cp';
    }

    getServiceUUids(): string[] {
        return BleCyclingPowerDevice.services;
    }

    getRpm(crankData) {
        if (!this.prevCrankData) this.prevCrankData= {revolutions:0,time:0, cntUpdateMissing:-1}

        const c = this.currentCrankData = crankData
        const p = this.prevCrankData;
        let rpm = this.rpm;
        let hasUpdate = c.time!==p.time;

        if ( hasUpdate) { 
            let time = c.time - p.time //+ c.time<p.time ? 0x10000: 0
            let revs = c.revolutions - p.revolutions //+ c.revolutions<p.revolutions ? 0x10000: 0

            if (c.time<p.time) time+=0x10000;
            if (c.revolutions<p.revolutions) revs+=0x10000;
            
            rpm = 1024*60*revs/time
        }
        else {
            if ( p.cntUpdateMissing<0 || p.cntUpdateMissing>2) {
                rpm = 0;
            }
        }
        const cntUpdateMissing = p.cntUpdateMissing;
        this.prevCrankData = this.currentCrankData
        if ( hasUpdate)  
            this.prevCrankData.cntUpdateMissing = 0;
        else 
            this.prevCrankData.cntUpdateMissing = cntUpdateMissing+1;

        return rpm;
    }

    parsePower(data: Buffer):PowerData { 

        try {
            let offset = 4;
            const flags = data.readUInt16LE(0)

            this.instantaneousPower = data.readUInt16LE(2)
            if ( flags&0x1)  
                this.balance = data.readUInt8(offset++);
            if ( flags&0x4)  {
                this.accTorque = data.readUInt16LE(offset);
                offset+=2;
            }
            if ( flags&0x20)  {
                const crankData = { 
                    revolutions: data.readUInt16LE(offset),
                    time: data.readUInt16LE(offset+2)
                }
                this.rpm = this.getRpm(crankData)                
                offset+=4
            }
            
        }
        catch (err) { 

        }
        const {instantaneousPower, balance,accTorque,rpm} = this
        return {instantaneousPower, balance,accTorque,rpm,raw:data}
    }

    onData(characteristic:string,data: Buffer) {
        if (characteristic.toLocaleLowerCase() === '2a63') { //  name: 'Heart Rate Measurement',
            const res = this.parsePower(data)
            this.emit('data', res)
        }
  
    }

    write(characteristic, data) {
        console.log('write',characteristic, data)
        return Promise.resolve(true);
    }
    read(characteristic) {
        console.log('read',characteristic)
        return Promise.resolve(Buffer.from([]));
    }

}
BleInterface.register('BleCyclingPowerDevice','cp', BleCyclingPowerDevice,BleCyclingPowerDevice.services)

