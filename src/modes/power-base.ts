import { IncyclistBikeData, Settings,  CyclingModeBase } from './cycling-mode';

import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT} from '../base/adpater';
import calc from '../utils/calculations'
import { EventLogger } from 'gd-eventlog';
import { IncyclistDeviceAdapter } from '../types/adapter';



export default class PowerBasedCyclingModeBase extends CyclingModeBase  {

    data: IncyclistBikeData;
    prevUpdateTS: number = 0;
    logger: EventLogger;

    constructor(adapter: IncyclistDeviceAdapter, props?: Settings) {
        super(adapter,props);
        this.data = { speed: 0 , power:0,  distanceInternal:0, pedalRpm:0, isPedalling:false, heartrate:0}
    }

    initLogger(defaultLogName) {
        const a = this.adapter as any
        this.logger = (a && a.getLogger) ? a.getLogger() : undefined;
        if (!this.logger) this.logger = new EventLogger(defaultLogName)
    }

    getWeight() {
        const a = this.adapter as any;            
        const m = (a && a.getWeight && a.getWeight()) ? a.getWeight() : DEFAULT_BIKE_WEIGHT+ DEFAULT_USER_WEIGHT;
        return m;
    }

    getTimeSinceLastUpdate() {
        const ts = Date.now();
        const duration = this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
        this.prevUpdateTS = ts       
        return duration
    }

    calculateSpeedAndDistance(power: number, slope: number, m: number, t: number, props= {}) { 
        const prevData = this.data || {} as any;

        const vPrev = (prevData.speed || 0 )/3.6
        const EkinPrev = 1/2*m*vPrev*vPrev;
                
        let powerToMaintainSpeed = calc.calculatePower(m,vPrev,slope,props);

        //no update for more than 30s - we need to reset
        if (t>=30) {
            const speed = calc.calculateSpeed(m,power,slope,props)            
            return { speed,distance:0}
        }



        const powerDelta = powerToMaintainSpeed - power;
        const Ekin = EkinPrev-powerDelta*t;
        if (Ekin>0) {
            const v = Math.sqrt(2*Ekin/m);
            const speed = v*3.6;
            const distance = v*t;

            this.data.speed = speed;
            return {speed,distance}
        }
        else {
            // Power is not sufficiant to keep moving
            const v = vPrev *0.5;
            const speed = v*3.6;
            const distance = v*t;
            this.data.speed = speed;
            return {speed,distance}

        }
    }

    calculatePowerAndDistance(speed: number, slope: number, m: number, t: number, props= {}) { 
        const prevData = this.data || {} as any;

        const vPrev = (prevData.speed || 0 )/3.6
        const EkinPrev = 1/2*m*vPrev*vPrev;
        const vTarget = (speed||0) /3.6;
        const Ekin = 1/2*m*vTarget*vTarget;

        const powerDelta = t!==0 ? (EkinPrev - Ekin)/t : 0;
        const powerToMaintainSpeed = calc.calculatePower(m,vPrev,slope,props);
        const power = powerToMaintainSpeed - powerDelta;
        
        const v = speed/3.6
        const distance = v*t;

        this.data.power = power;
        return {power,distance}

    }


}