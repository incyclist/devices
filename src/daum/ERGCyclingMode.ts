import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeBase, CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, Settings, UpdateRequest } from "../CyclingMode";
import DaumAdapter from "./DaumAdapter";
import calc from '../calculations'


const config = {
    name: "ERG",
    description: "Calculates speed based on power and slope. Power is either set by workout or calculated based on gear and cadence",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
        {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},
    ]
}

export type ERGEvent = {
    rpmUpdated?: boolean;
    gearUpdated?: boolean;
    starting?: boolean;
    tsStart?: number;
}


export default class ERGCyclingMode extends CyclingModeBase implements CyclingMode {

    logger: EventLogger;
    data: IncyclistBikeData ;
    prevRequest: UpdateRequest;
    prevUpdateTS: number = 0;
    hasBikeUpdate: boolean = false;
    chain: number[];
    cassette: number[];
    event: ERGEvent ={};

    constructor(adapter: DaumAdapter, props?:any) {

        super(adapter,props);
        this.logger = adapter.logger || new EventLogger('ERGMode')           
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
        const startPower = this.getSetting('startPower');
        return { targetPower: startPower};
    }    

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        const getData= ()=>{
            if (!this.data) return {}
            const {gear,pedalRpm,slope, power,speed} = this.data;
            return {gear,pedalRpm,slope, power,speed} 
        }
        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest,data:getData(),event:this.event} );        

        let newRequest:UpdateRequest = {}
        try {

            if ( !request || request.reset || Object.keys(request).length===0 ) {
                this.prevRequest = {};
                return request||{};
            }

            const prevData = this.data || {} as any;

            if (request.targetPower!==undefined) {
                delete request.slope                
                delete request.refresh;               
            }

            // don't update below the startPower during the first 5 seconds of a ride or after a pause
            if (this.event.starting && request.targetPower===undefined) {
                const startPower = this.getSetting('startPower');
                if (this.event.tsStart && Date.now()-this.event.tsStart>5000) {
                    delete this.event.starting;
                    delete this.event.tsStart;
                }
                const target =this.calculateTargetPower(request);
                if (target<=startPower && (!request.minPower || target>=request.minPower)) {                    
                    return {};                    
                }
                else {
                    delete this.event.starting;
                    delete this.event.tsStart;
                }                
            }

            // no slope change or targets change -> refresh
            if ( request.refresh) {
                delete request.refresh;
 
                if ( this.prevRequest!==undefined && !this.event.gearUpdated && !this.event.rpmUpdated)  {
                    newRequest.targetPower = this.prevRequest.targetPower;
                }
                else {
                    newRequest.targetPower = this.calculateTargetPower(request);
                }

                

                if ( this.prevRequest!==undefined && Object.keys(this.prevRequest).length>0)  {
                    request = {...this.prevRequest};
                }
                else {
                    newRequest.targetPower = this.calculateTargetPower(request);
                }

            } 

            if (request.slope!==undefined) {
                if (!this.data) this.data = {} as any;
                this.data.slope = request.slope;
            }
                
            if (request.maxPower!==undefined && request.minPower!==undefined && request.maxPower===request.minPower) {
                request.targetPower = request.maxPower;                
            }
    
            if (request.targetPower===undefined) {
                newRequest.targetPower = this.calculateTargetPower(request)
            }
            else {
                newRequest.targetPower = request.targetPower;
            }
            delete request.slope;
                
    
            if (request.maxPower!==undefined) {
                if (newRequest.targetPower!==undefined && newRequest.targetPower>request.maxPower) {
                    newRequest.targetPower = request.maxPower;
                }
                newRequest.maxPower = request.maxPower;
            }
        
            if (request.minPower!==undefined) {
                if (newRequest.targetPower!==undefined && newRequest.targetPower<request.minPower) {
                    newRequest.targetPower = request.minPower;
                }
                newRequest.minPower = request.minPower;
            }            
    

            if ( newRequest.targetPower!==undefined && prevData.power!==undefined && newRequest.targetPower===prevData.power) {
                // no update needed
                delete newRequest.targetPower;
            }
    
            this.prevRequest = JSON.parse(JSON.stringify(request));
    
    
        }
        
        catch ( err)  /* istanbul ignore next */ {
            this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message||err,stack:err.stack} );

        }
        
        return newRequest;



        
    }


    updateData(bikeData: IncyclistBikeData) {
        const prevData = JSON.parse(JSON.stringify(this.data || {} ))
        const prevSpeed = prevData.speed;        
        const prevRequest = this.prevRequest || {};
        const data = this.data || {} as any;

        const bikeType = this.getSetting('bikeType');

        delete this.event.gearUpdated;
        delete this.event.rpmUpdated;       
       
        if (prevData==={} || prevData.speed===undefined || prevData.speed===0) {
            this.event.starting = true;
            this.event.tsStart = Date.now();
        }

        try {

            let rpm = bikeData.pedalRpm || 0;
            let gear = bikeData.gear || 0
            let power = bikeData.power || 0;
            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
            let speed;

            let m = (this.adapter as DaumAdapter).getWeight();
            let distanceInternal = prevData.distanceInternal || 0;  // meters
            let distance = Math.round(distanceInternal/100);
            let ts = Date.now();
            let duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
                
            //let speed = calc.calculateSpeedDaum(gear, rpm, bikeType)
            if (rpm===0 || bikeData.isPedalling===false) {
                speed = 0;
                power = 0;
            }
            else {
                speed = calc.calculateSpeed(m,power,slope,{bikeType} ); // km/h
                let v = speed/3.6;
                distanceInternal += Math.round(v*duration);
                distance =   Math.round(distanceInternal/100);    
            }
        
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal);
            data.distance = distance;
            data.slope = slope;
            data.pedalRpm = rpm;
            data.gear = gear;
            if ( data.time)
                data.time+=duration;
            else data.time =0;
            data.heartrate=bikeData.heartrate;
            data.isPedalling=bikeData.isPedalling;

            if (gear!==prevData.gear) {
                this.event.gearUpdated = true;
            }
            if (rpm && rpm!==prevData.pedalRpm) {
                this.event.rpmUpdated = true;
            }
            
            this.prevUpdateTS = ts       
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest,prevSpeed} );

        this.data = data;
        return data;
        
    }


    calculateTargetPower(request, updateMode=true) {       
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
    }

}