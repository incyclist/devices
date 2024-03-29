import { EventLogger } from "gd-eventlog";

import { CyclingModeProperyType, UpdateRequest } from "./types";
import { IncyclistBikeData } from "../types";
import { Simulator } from "../simulator/Simulator";
import PowerBasedCyclingModeBase from "./power-base";

const MIN_SPEED = 10;


export type ERGEvent = {
    rpmUpdated?: boolean;
    gearUpdated?: boolean;
    starting?: boolean;
    tsStart?: number;
}


export default class SimulatorCyclingMode extends PowerBasedCyclingModeBase { 
   
    protected static config = {
        isERG: true,
        name: "Simulator",
        description: "Simulates a ride with constant speed or power output",
        properties: [
            {key:'mode',name: 'Simulation Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Speed','Power'], default: 'Power'},
            {key:'delay',name: 'Start Delay', description: 'Delay (in s) at start of training', type: CyclingModeProperyType.Integer, default: 2, min:0, max:30},
            {key:'power',name: 'Power', description: 'Power (in W) at start of training', condition: (s)=> !s.mode || s.mode==='Power', type: CyclingModeProperyType.Integer, default: 150, min:25, max:800},
            {key:'speed',name: 'Speed', description: 'Speed (in km/h) at start of training', condition: (s)=> s.mode==='Speed', type: CyclingModeProperyType.Integer, default: 30, min:5, max:50},
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'}
        ]
    }
    logger: EventLogger;
    data: IncyclistBikeData ;
    prevRequest: UpdateRequest;
    prevUpdateTS: number = 0;
    event: ERGEvent ={};

    constructor(adapter: Simulator, props?:any) {
        super(adapter,props);
        this.initLogger('SIMMode')
    }

    getBikeInitRequest(): UpdateRequest {        
        return { };
    }    


    updateData(bikeData: IncyclistBikeData): IncyclistBikeData {       
        const prevData = JSON.parse(JSON.stringify(this.data || {} ))
        const prevSpeed = prevData.speed;        
        const prevRequest = this.prevRequest || {};
        const data = this.data || {} as any;
        const bikeType = (this.getSetting('bikeType')||'Race').toLowerCase();

        const mode = this.getSetting( 'mode' )
        delete this.event.gearUpdated;
        delete this.event.rpmUpdated;       
      

        try {

            let rpm = bikeData.pedalRpm===undefined ? 90 : bikeData.pedalRpm;
            let power = (!mode || mode.toLowerCase()==='power' ) ? Number(this.getSetting('power')): bikeData.power || 0;
            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); 
            let speed = mode.toLowerCase()==='speed' ? Number(this.getSetting('speed')): bikeData.speed || 0;
            let m = this.getWeight();

            let distanceInternal = prevData.distanceInternal || 0;  // meters
            let ts = Date.now();
            let duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
            const t =  this.getTimeSinceLastUpdate();
            let distance=0;



            //let speed = calc.calculateSpeedDaum(gear, rpm, bikeType)
            if (!mode || mode.toLowerCase()==='power' )  { 

                if (rpm===0)
                    power=0;

                const res = this.calculateSpeedAndDistance(power,slope,m,t,{bikeType});
                //console.log( '~~~Simulator.calculateSpeedAndDistance', distanceInternal,data.time, {power, slope,m,t,bikeType}, res.speed,res.distance)

                speed = res.speed;
                distance = res.distance;
                
            }
            else if (mode.toLowerCase()==='speed') {
                if (rpm===0)
                    speed=0;

                const res = this.calculatePowerAndDistance(speed,slope,m,t,{bikeType});
                //console.log( '~~~Simulator.calculatePowerAndDistance', distanceInternal,data.time, {speed, slope,m,t,bikeType}, res.power,res.distance)
                power = res.power;
                distance = res.distance;
            }


            if ( prevRequest.targetPower) {
                power = prevRequest.targetPower;
                const res = this.calculateSpeedAndDistance(power,slope,m,t,{bikeType});
                speed = res.speed;
                distance = res.distance;
                
            }
            
            if ( prevRequest.maxPower && power>prevRequest.maxPower) {
                power = prevRequest.maxPower;
                const res = this.calculateSpeedAndDistance(power,slope,m,t,{bikeType});
                speed = res.speed;
                distance = res.distance;
            }
            else if ( prevRequest.minPower && power<prevRequest.minPower) {
                power = prevRequest.minPower;
                const res = this.calculateSpeedAndDistance(power,slope,m,t,{bikeType});
                speed = res.speed;
                distance = res.distance;
            }

            if (power===0 && speed<MIN_SPEED) {
                data.speed = Math.round(prevData.speed-1)<0 ? 0: Math.round(prevData.speed-1)
                data.distanceInternal = distanceInternal+ data.speed/3.6*t;
            }
            else {
                data.speed = speed;
                data.distanceInternal = distanceInternal+distance;
            } 
    
            if (data.speed<0.1)
                data.speed = 0
            data.power = Math.round(power);
            data.distanceInternal = distanceInternal+distance;
            data.slope = slope;
            data.pedalRpm = rpm;
            if ( data.time!==undefined)
                data.time+=duration;
            else data.time =0;
            data.heartrate=bikeData.heartrate;
            data.isPedalling=true;

            this.prevUpdateTS = ts       
    
        }
        catch (err) {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest,prevSpeed} );

        this.data = data;
        return data;

        
    }


}