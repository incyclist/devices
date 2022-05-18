import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeBase, CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, Settings, UpdateRequest } from "../CyclingMode";
import { Simulator } from "./Simulator";
import calc from '../calculations'


const config = {
    name: "Simulator",
    description: "Simulates a ride with constant speed or power output",
    properties: [
        {key:'mode',name: 'Simulation Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Speed','Power'], default: 'Power'},
        {key:'delay',name: 'Start Delay', description: 'Delay (in s) at start of training', type: CyclingModeProperyType.Integer, default: 2, min:0, max:30},
        {key:'power',name: 'Power', description: 'Power (in W) at start of training', condition: (s)=> !s.simType || s.simType==='Power', type: CyclingModeProperyType.Integer, default: 150, min:25, max:800},
        {key:'speed',name: 'Speed', description: 'Speed (in km/h) at start of training', condition: (s)=> s.simType==='Speed', type: CyclingModeProperyType.Integer, default: 30, min:5, max:50},
    ]
}

export type ERGEvent = {
    rpmUpdated?: boolean;
    gearUpdated?: boolean;
    starting?: boolean;
    tsStart?: number;
}


export default class SimulatorCyclingMode extends CyclingModeBase implements CyclingMode { 


    logger: EventLogger;
    data: IncyclistBikeData ;
    prevRequest: UpdateRequest;
    prevUpdateTS: number = 0;
    hasBikeUpdate: boolean = false;
    chain: number[];
    cassette: number[];
    event: ERGEvent ={};

    constructor(adapter: Simulator, props?:any) {

        super(adapter,props);
        this.logger = adapter.logger || new EventLogger('SIMMode')           
        this.data = {} as any;

        this.logger.logEvent({message:'constructor',props})
    }


    getName(): string {
        return config.name;
    }
    getDescription(): string {
        return config.description;
    }
    getProperties(): CyclingModeProperty[] {
        return config.properties;
    }
    getProperty(name: string): CyclingModeProperty {
        return config.properties.find(p => p.name===name);
    }

    getBikeInitRequest(): UpdateRequest {        
        return { };
    }    

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {

        this.logger.logEvent({message:'bike update request',request})
        

        const r = request || { refresh:true} as any
        if ( r.refresh) {
            if (Object.keys(r).length===1)
                return;
            delete r.refresh;
        }

        if (request.slope!==undefined) {
            if (!this.data) this.data = {} as any;
            this.data.slope = request.slope;
        }

        

        this.prevRequest = JSON.parse(JSON.stringify(request));
        return r;
        
    }


    updateData(bikeData: IncyclistBikeData): IncyclistBikeData {
        
        const prevData = JSON.parse(JSON.stringify(this.data || {} ))
        const prevSpeed = prevData.speed;        
        const prevRequest = this.prevRequest || {};
        const data = this.data || {} as any;

        const mode = this.getSetting( 'mode' )
        delete this.event.gearUpdated;
        delete this.event.rpmUpdated;       
      

        try {

            let rpm = 90;
            let power = (mode==='Power'|| !mode) ? this.getSetting('power'): bikeData.power || 0;
            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); 
            let speed = mode==='Speed' ? this.getSetting('speed'): bikeData.speed || 0;
            let m = 75;

            let distanceInternal = prevData.distanceInternal || 0;  // meters
            let ts = Date.now();
            let duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
                
            //let speed = calc.calculateSpeedDaum(gear, rpm, bikeType)
            if (mode==='Power' || !mode)  { 
                speed = calc.calculateSpeed(m,power,slope,{bikeType:'race'} ); // km/h
            }
            else if (mode==='Speed') {
                power = calc.calculatePower(m,speed/3.6,slope,{bikeType:'race'})
            }

            if ( prevRequest.targetPower) {
                power = prevRequest.targetPower;
                speed = calc.calculateSpeed(m,power,slope,{bikeType:'race'} )
            }
            
            if ( prevRequest.maxPower && power>prevRequest.maxPower) {
                power = prevRequest.maxPower;
                speed = calc.calculateSpeed(m,power,slope,{bikeType:'race'} )
            }
            else if ( prevRequest.minPower && power<prevRequest.minPower) {
                power = prevRequest.minPower;
                speed = calc.calculateSpeed(m,power,slope,{bikeType:'race'} )
            }

            let v = speed/3.6;
            distanceInternal += Math.round(v*duration);

    
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = distanceInternal;
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


    calculateTargetPower(request, updateMode=true) {       
        /*
        const bikeType = this.getSetting('bikeType').toLowerCase();
        const defaultPower = this.getSetting('startPower');

        let m = (this.adapter as DaumAdapter).getWeight();
        const prevData = this.data || {} as any;
        let target;

        if ( prevData.pedalRpm  && prevData.gear  && (!updateMode ||prevData.pedalRpm!==0)  ) {
            const speed = calc.calculateSpeedDaum(prevData.gear,prevData.pedalRpm,bikeType);
            var power = calc.calculatePower(m,speed/3.6,0,{bikeType});
            target = Math.round(power);
        }
        else {
            target = Math.round(request.targetPower || defaultPower);
        }        
        
        return target;
        */
    }


}