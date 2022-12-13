import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, UpdateRequest } from "../cycling-mode";
import { DeviceAdapter } from "../device";
import PowerBasedCyclingModeBase from "../modes/power-base";


const config = {
    name: "ERG",
    description: "Calculates speed based on power and slope. Power targets are set by workout or remain stable throughout the workout",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
        {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},

    ]
}
const MIN_SPEED = 10;

export default class BleERGCyclingMode extends PowerBasedCyclingModeBase implements CyclingMode {

    static isERG = true;

    prevRequest: UpdateRequest;
    hasBikeUpdate: boolean = false;
    chain: number[];
    cassette: number[];

    constructor(adapter: DeviceAdapter, props?:any) {
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
        const startPower = Number(this.getSetting('startPower'));
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

            if ( !request || request.reset  ) {
                this.prevRequest = {};
                return request.reset ? {reset:true} : {};
            }

            if ( Object.keys(request).length===0 && this.prevRequest) {
            
                request.targetPower = this.prevRequest.targetPower;
            }

            const prevData = this.data || {} as any;
            if (request.slope!==undefined) {
                if (!this.data) this.data = {} as any;
                this.data.slope = request.slope;
            }
            delete request.slope                

            if (request.targetPowerDelta && this.prevRequest && this.prevRequest.targetPower) {
                request.targetPower = this.prevRequest.targetPower + request.targetPowerDelta;
                if (request.targetPower<10)
                    request.targetPower = this.prevRequest.targetPower
                delete request.targetPowerDelta
            }

            if (request.targetPower!==undefined) {
                delete request.refresh;           
                newRequest.targetPower = Number(request.targetPower)    
            }

            // no slope change or targets change -> refresh
            if ( request.refresh && request.targetPower===undefined) {
                delete request.refresh; 
                newRequest.targetPower = this.prevRequest.targetPower;
            } 
               
            if (request.targetPower===undefined && request.maxPower!==undefined && request.minPower!==undefined && request.maxPower===request.minPower) {
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

            if (Object.keys(newRequest).length===0 ) {
                if (this.prevRequest)
                    newRequest.targetPower = this.prevRequest.targetPower
                newRequest.refresh=true

            } 
    
   
            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
    
    
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
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest,prevSpeed} );

        this.data = data;
        return data;
        
    }


}