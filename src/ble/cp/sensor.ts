import { PowerData } from './types.js';
import {CSP, CSP_MEASUREMENT,CSP_FEATURE}  from '../consts.js'
import { matches } from '../utils.js';
import { LegacyProfile } from '../../antv2/types.js';
import { BleProtocol } from '../types.js';
import { TBleSensor } from '../base/sensor.js';
import { CrankCadenceCalculator } from '../crank-cadence.js';


export default class BleCyclingPowerDevice extends TBleSensor {
    static readonly profile: LegacyProfile = 'Power Meter'
    static readonly protocol:BleProtocol = 'cp'
    static readonly services =  [CSP];
    static readonly characteristics =  [ CSP_MEASUREMENT, CSP_FEATURE, '2a5d', '2a3c' ];
    static readonly detectionPriority = 1;

    instantaneousPower: number = undefined;
    balance: number = undefined;
    accTorque:number = undefined;
    rpm: number = undefined
    time: number = undefined
    protected crankCadence = new CrankCadenceCalculator()

    parsePower(_data: Uint8Array):PowerData {
        const data:Buffer = Buffer.from(_data);
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

            if ( flags&0x10)  {  // wheel revolutions
                offset+=6
            }
            if ( flags&0x20)  {  // crank revolutions
                const crankData = { 
                    revolutions: data.readUInt16LE(offset),
                    time: data.readUInt16LE(offset+2)
                }
                const {rpm,time} = this.crankCadence.update(crankData)
                this.rpm = rpm;
                this.time = time;
            }
            
        }
        catch  { 

        }
        const {instantaneousPower, balance,accTorque,rpm,time} = this
        return {instantaneousPower, balance,accTorque,rpm,time,raw:`2a63:${data.toString('hex')}`}
    }

    protected getRequiredCharacteristics():Array<string> {
        return [CSP_MEASUREMENT]
    }

    onData(characteristic:string,characteristicData: Buffer):boolean {       
        const data = Buffer.from(characteristicData);
        const hasData = super.onData(characteristic,data);
        if (!hasData) 
            return false;



        if ( matches(characteristic,CSP_MEASUREMENT)) { //  name: 'Cycling Power Measurement',
            const res = this.parsePower(data)
            this.emit('data', res)
            return false;
        }
        return true;
  
    }

    reset() {
        this.instantaneousPower = undefined;
        this.balance = undefined;
        this.accTorque = undefined;
        this.rpm = undefined
        this.time = undefined
        this.crankCadence = new CrankCadenceCalculator()
    }

}

