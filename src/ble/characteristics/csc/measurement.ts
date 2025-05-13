import { CrankData } from "../../cp";
import { CharacteristicParser, Feature } from "../types";

export type CyclingCadenceAndSpeed = {
    cadence?: number    // rpm
    speed?:number       // m/s
}

export class CscMeasurement implements CharacteristicParser<CyclingCadenceAndSpeed> {

    protected prevCrankData: CrankData = undefined
    protected currentCrankData: CrankData = undefined
    protected prevWheelData: CrankData = undefined
    protected currentWheelData: CrankData = undefined

    protected timeOffset: number = 0
    protected cw: number = 2.1

    constructor(protected data: CyclingCadenceAndSpeed={}) {}

    setWheelCircumference(wheelCircumference) {
        this.cw = wheelCircumference 
    }

    parse(buffer: Buffer, features?: Feature): CyclingCadenceAndSpeed {
        const data:Buffer = Buffer.from(buffer);
        
        
        let offset = 0;

        const flags = data.readUInt8(offset); offset++;
        if (flags & 0x01) {  // wheel revolutions
            const wheelData = { 
                revolutions: data.readUInt32LE(offset),
                time: data.readUInt16LE(offset+4)
            }
            const {speed} = this.parseWheelData(wheelData)                
            this.data.speed = speed;            
            offset+=6;
        }
        if (flags & 0x02) {  // crank revolutions
            const crankData = { 
                revolutions: data.readUInt16LE(offset),
                time: data.readUInt16LE(offset+2)
            }
            const {rpm} = this.parseCrankData(crankData)                
            this.data.cadence = rpm;            
        }
        return this.data;

    } 

    protected parseCrankData(crankData) {
        if (!this.prevCrankData) {
            this.prevCrankData= {...crankData, cntUpdateMissing:-1}
            return {}
        }

        const c = this.currentCrankData = crankData
        const p = this.prevCrankData;
        let rpm = this.data.cadence;
        
        let hasUpdate = c.time!==p.time;

        if ( hasUpdate) { 
            let time = c.time - p.time //+ c.time<p.time ? 0x10000: 0
            let revs = c.revolutions - p.revolutions //+ c.revolutions<p.revolutions ? 0x10000: 0

            if (c.time<p.time) {
                 time+=0x10000;
                 this.timeOffset+=0x10000;
                 
            }

            if (c.revolutions<p.revolutions) revs+=0x10000;
            const seconds = time/1024
            
            rpm = 60*revs/seconds
        }
        else if ( p.cntUpdateMissing<0 || p.cntUpdateMissing>2) {
                rpm = 0;            
        }
        const cntUpdateMissing = p.cntUpdateMissing;
        this.prevCrankData = this.currentCrankData
        if ( hasUpdate)  
            this.prevCrankData.cntUpdateMissing = 0;
        else 
            this.prevCrankData.cntUpdateMissing = cntUpdateMissing+1;

        return {rpm, time:this.timeOffset+c.time }
    }
    protected parseWheelData(wheelData) {
        if (!this.prevWheelData) {
            this.prevWheelData= {...wheelData, cntUpdateMissing:-1}
            return {}
        }

        const c = this.currentWheelData = wheelData
        const p = this.prevWheelData;
        let speed = this.data.speed;
        
        let hasUpdate = c.time!==p.time;

        if ( hasUpdate) { 
            let time = c.time - p.time //+ c.time<p.time ? 0x10000: 0
            let revs = c.revolutions - p.revolutions //+ c.revolutions<p.revolutions ? 0x10000: 0

            if (c.time<p.time) {
                 time+=0x10000;
                 this.timeOffset+=0x10000;
                 
            }

            const seconds = time/1024
            
            const rps = revs/seconds
            speed = rps * this.cw   // m/s

        }
        else if ( p.cntUpdateMissing<0 || p.cntUpdateMissing>2) {
            speed = 0;            
        }


        const cntUpdateMissing = p.cntUpdateMissing;
        this.prevWheelData = this.currentWheelData
        if ( hasUpdate)  
            this.prevWheelData.cntUpdateMissing = 0;
        else 
            this.prevWheelData.cntUpdateMissing = cntUpdateMissing+1;

        return {speed, time:this.timeOffset+c.time }
    }

    reset() {
        this.data = {}
        this.prevCrankData = undefined
        this.currentCrankData = undefined
        this.timeOffset = 0
    }


}