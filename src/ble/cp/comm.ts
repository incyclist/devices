import { CrankData, PowerData } from './types';
import {CSP, CSP_MEASUREMENT,CSP_FEATURE}  from '../consts'
import { matches } from '../utils';
import { BleComms } from '../base/comms';
import { LegacyProfile } from '../../antv2/types';
import { BleProtocol, IBlePeripheralConnector } from '../types';


export default class BleCyclingPowerDevice extends BleComms {
    static protocol:BleProtocol = 'cp'
    static services =  [CSP];
    static characteristics =  [ CSP_MEASUREMENT, CSP_FEATURE, '2a5d', '2a3c' ];
    static detectionPriority = 1;
    
    instantaneousPower: number = undefined;
    balance: number = undefined;
    accTorque:number = undefined;
    rpm: number = undefined
    timeOffset: number = 0
    time: number = undefined
    currentCrankData: CrankData = undefined
    prevCrankData: CrankData = undefined
    
    static isMatching(characteristics: string[]): boolean {
        if (!characteristics)
            return false;

        const hasCPMeasurement =  characteristics.find( c => c===CSP_MEASUREMENT)!==undefined
        const hasCPFeature = characteristics.find( c => c===CSP_FEATURE)!==undefined
        
        return hasCPMeasurement && hasCPFeature
    }


    getProfile(): LegacyProfile {
        return 'Power Meter';
    }

    getProtocol(): BleProtocol {
        return BleCyclingPowerDevice.protocol
    }

    getServiceUUids(): string[] {
        return BleCyclingPowerDevice.services;
    }

    subscribeAll(conn?: IBlePeripheralConnector):Promise<void> {
        return  this.subscribeMultiple( [ CSP_MEASUREMENT ], conn)
    }    

    parseCrankData(crankData) {
        if (!this.prevCrankData) this.prevCrankData= {revolutions:0,time:0, cntUpdateMissing:-1}

        const c = this.currentCrankData = crankData
        const p = this.prevCrankData;
        let rpm = this.rpm;
        
        let hasUpdate = c.time!==p.time;

        if ( hasUpdate) { 
            let time = c.time - p.time //+ c.time<p.time ? 0x10000: 0
            let revs = c.revolutions - p.revolutions //+ c.revolutions<p.revolutions ? 0x10000: 0

            if (c.time<p.time) {
                 time+=0x10000;
                 this.timeOffset+=0x10000;
                 
            }

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

        return {rpm, time:this.timeOffset+c.time }
    }

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
                const {rpm,time} = this.parseCrankData(crankData)                
                this.rpm = rpm;
                this.time = time;
                offset+=4
            }
            
        }
        catch (err) { 

        }
        const {instantaneousPower, balance,accTorque,rpm,time} = this
        return {instantaneousPower, balance,accTorque,rpm,time,raw:`2a63:${data.toString('hex')}`}
    }

    onData(characteristic:string,data: Buffer): boolean {
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
        this.timeOffset = 0
        this.time = undefined
        this.currentCrankData = undefined
        this.prevCrankData = undefined
    
    }

}

