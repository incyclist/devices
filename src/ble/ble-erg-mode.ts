import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, UpdateRequest } from "../CyclingMode";
import PowerBasedCyclingModeBase from "../modes/power-base";
import { FmAdapter } from "./fm";


const config = {
    name: "ERG",
    description: "Calculates speed based on power and slope. Power targets are set by workout or remain stable throughout the workout",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
        {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},

    ]
}

export default class BleERGCyclingMode extends PowerBasedCyclingModeBase implements CyclingMode {

    prevRequest: UpdateRequest;
    hasBikeUpdate: boolean = false;
    chain: number[];
    cassette: number[];

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
        return { slope:0, targetPower: startPower};
    }    


    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        const getData= ()=>{
            if (!this.data) return {}
            const {pedalRpm,slope, power,speed} = this.data;
            return {pedalRpm,slope, power,speed} 
        }
        console.log('~~~ ERG Mode processing update request',request,this.prevRequest,getData())
        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest,data:getData()} );        

        let newRequest:UpdateRequest = {}
        try {

            if ( !request || request.reset || Object.keys(request).length===0 ) {
                this.prevRequest = {};
                return request.reset ? {reset:true} : {};
            }

            const prevData = this.data || {} as any;

            if (request.targetPower!==undefined) {
                delete request.slope                
                delete request.refresh;               
            }

            // no slope change or targets change -> refresh
            if ( request.refresh) {
                delete request.refresh; 
                newRequest.targetPower = this.prevRequest.targetPower;
            } 

            if (request.slope!==undefined) {
                if (!this.data) this.data = {} as any;
                this.data.slope = request.slope;
                delete request.slope;
            }
                
            if (request.maxPower!==undefined && request.minPower!==undefined && request.maxPower===request.minPower) {
                request.targetPower = request.maxPower;                
                newRequest.targetPower = request.targetPower;
            }
   
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

                if ( prevData.power && prevData.power<request.minPower)
                    newRequest.targetPower = request.minPower
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

            if (data.time!==undefined && data.speed>0)
                data.time+=t;
            else data.time =0;
            data.heartrate=bikeData.heartrate;
            data.isPedalling=bikeData.isPedalling;
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest,prevSpeed} );

        this.data = data;
        return data;
        
    }


}