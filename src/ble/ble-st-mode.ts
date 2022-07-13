import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, UpdateRequest } from "../CyclingMode";
import PowerBasedCyclingModeBase from "../modes/power-base";
import { FmAdapter } from "./fm";


const config = {
    name: "Smart Trainer",
    description: "Calculates speed based on power and slope. Slope is set to the device",
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


export default class ERGCyclingMode extends PowerBasedCyclingModeBase implements CyclingMode {

    prevRequest: UpdateRequest;
    hasBikeUpdate: boolean = false;
    chain: number[];
    cassette: number[];
    event: ERGEvent ={};

    constructor(adapter: FmAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('ERGMode')
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
            const {pedalRpm,slope, power,speed} = this.data;
            return {pedalRpm,slope, power,speed} 
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

                newRequest.targetPower = this.getSetting('startPower');
                if (this.event.tsStart && Date.now()-this.event.tsStart>5000) {
                    delete this.event.starting;
                    delete this.event.tsStart;
                }                
            }

            // no slope change or targets change -> refresh
            if ( request.refresh) {
                delete request.refresh; 
                newRequest.targetPower = this.prevRequest.targetPower;
            } 

            if (request.slope!==undefined) {
                if (!this.data) this.data = {} as any;
                this.data.slope = request.slope;
            }
                
            if (request.maxPower!==undefined && request.minPower!==undefined && request.maxPower===request.minPower) {
                request.targetPower = request.maxPower;                
            }
    
            if (request.targetPower!==undefined) {
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

        const bikeType = this.getSetting('bikeType').toLowerCase();
        
        delete this.event.rpmUpdated;       
       
        if (prevData==={} || prevData.speed===undefined || prevData.speed===0) {
            this.event.starting = true;
            this.event.tsStart = Date.now();
        }

        try {

            const rpm = bikeData.pedalRpm || 0;
            let power = bikeData.power || 0;
            const slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
            const distanceInternal = prevData.distanceInternal || 0;  // meters
            if (!bikeData.pedalRpm || bikeData.isPedalling===false) {
                power = 0;
            }

            // calculate speed and distance
            const m = this.getWeight();
            const t =  this.getTimeSinceLastUpdate();
            const {speed,distance} = this.calculateSpeedAndDistance(power,slope,m,t,{bikeType});
        
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal+distance);
            data.slope = slope;
            data.pedalRpm = rpm;

            if ( data.time!==undefined && !(this.event.starting && !bikeData.pedalRpm))
                data.time+=t;
            else data.time =0;
            data.heartrate=bikeData.heartrate;
            data.isPedalling=bikeData.isPedalling;

            if (rpm && rpm!==prevData.pedalRpm) {
                this.event.rpmUpdated = true;
            }
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest,prevSpeed} );

        this.data = data;
        return data;
        
    }


}