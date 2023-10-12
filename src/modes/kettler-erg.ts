import ICyclingMode, { CyclingModeProperyType, IncyclistBikeData, UpdateRequest } from './types';
import PowerBasedCyclingModeBase from './power-base';
import { IncyclistDeviceAdapter } from '../types/adapter';

const MIN_SPEED = 10;

export type ERGEvent = {
    rpmUpdated?: boolean;
    gearUpdated?: boolean;
    starting?: boolean;
    tsStart?: number;
}


export default class ERGCyclingMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static config = {
        isERG: true,
        name: "ERG",
        description: "Calculates speed based on power and slope. Power is either set by a workout",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
            {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},
        ]
    }
    prevRequest: UpdateRequest;
    hasBikeUpdate: boolean = false;
    chain: number[];
    cassette: number[];
    event: ERGEvent ={};

    constructor(adapter: IncyclistDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('ERGMode')
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
        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest,data:getData()} );        

        let newRequest:UpdateRequest = {}
        try {

            if ( !request || request.reset || Object.keys(request).length===0 ) {
                this.prevRequest = {};
                return request.reset ? {reset:true} : {};
            }

            const prevData = this.data || {} as any;
            if (request.slope!==undefined) {
                if (!this.data) this.data = {} as any;
                this.data.slope = request.slope;
            }
            delete request.slope;

            if (request.targetPower!==undefined) {
                delete request.refresh;               
            }

            // no slope change or targets change -> refresh
            if ( request.refresh) {
            
                delete request.refresh; 
                if (this.prevRequest)
                    newRequest.targetPower = this.prevRequest.targetPower;
                else {
                    this.prevRequest = this.getBikeInitRequest()
                    newRequest.targetPower = this.prevRequest.targetPower;
                }
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
            
            if (!newRequest.targetPower && newRequest.maxPower && prevData.power>newRequest.maxPower) {
                newRequest.targetPower = newRequest.maxPower
            }
            if (!newRequest.targetPower && newRequest.minPower && prevData.power<newRequest.minPower) {
                newRequest.targetPower = newRequest.minPower
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

            let power = bikeData.power || 0;
            const slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
            const distanceInternal = prevData.distanceInternal || 0;  // meters

            // calculate speed and distance
            const m = this.getWeight();
            const t =  this.getTimeSinceLastUpdate();
            const {speed,distance} = this.calculateSpeedAndDistance(power,slope,m,t,{bikeType});

            if (power===0 && speed<MIN_SPEED) {
                data.speed = Math.round(prevData.speed-1)<0 ? 0: Math.round(prevData.speed-1)
                data.distanceInternal = distanceInternal+ data.speed/3.6*t;
            }
            else {
                data.speed = (power===0 && speed<MIN_SPEED) ? 0 : speed;
                data.distanceInternal = (power===0 && speed<MIN_SPEED) ? distanceInternal: distanceInternal+distance;
            }
            data.power = Math.round(power);
            data.slope = slope;
            data.pedalRpm = bikeData.pedalRpm || 0;

            if (data.time!==undefined && data.speed>0)
                data.time+=t;
            else data.time =0;
            data.heartrate=bikeData.heartrate;
            data.isPedalling=bikeData.isPedalling;
            this.prevUpdateTS = Date.now()
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest,prevSpeed} );

        this.data = data;
        return data;
        
    }


}