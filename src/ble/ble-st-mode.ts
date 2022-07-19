import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, UpdateRequest } from "../CyclingMode";
import PowerBasedCyclingModeBase from "../modes/power-base";
import { FmAdapter } from "./fm";


const config = {
    name: "Smart Trainer",
    description: "Calculates speed based on power and slope. Slope is set to the device",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'}
    ]
}
const MIN_SPEED = 10;

export default class FtmsCyclingMode extends PowerBasedCyclingModeBase implements CyclingMode {

    prevRequest: UpdateRequest;
    hasBikeUpdate: boolean = false;

    constructor(adapter: FmAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('FtmsMode')
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

        return { slope:0};
    }    

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        // log request and context
        const getData= ()=>{
            if (!this.data) return {}
            const {gear,pedalRpm,slope, power,speed} = this.data;
            return {gear,pedalRpm,slope, power,speed} 
        }

        const event = {} as any
        if (this.data===undefined) event.noData = true;
        if (request.slope!==undefined && (event.noData || Math.abs(request.slope-this.data.slope)>=0.1 )) event.slopeUpdate  = true;
        if (this.prevRequest===undefined) event.initialCall = true;

        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest,data:getData(),event} );

        // prepare request to be sent to device
        // also: update slope in device data
        let newRequest:UpdateRequest = {};
        if (request.slope===undefined && request.refresh && this.prevRequest) {
            return this.prevRequest
        }

        if (request.slope!==undefined) {
            newRequest.slope = parseFloat(request.slope.toFixed(1));
            this.data.slope = newRequest.slope;
        }
        
        this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        return newRequest
        
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
            
            if (bikeData.pedalRpm===0  || bikeData.isPedalling===false) {
                power = 0;
            }

            // calculate speed and distance
            const m = this.getWeight();
            const t =  this.getTimeSinceLastUpdate();
            const {speed,distance} = this.calculateSpeedAndDistance(power,slope,m,t,{bikeType});

            if (power===0 && speed<MIN_SPEED) {
                data.speed = Math.round(prevData.speed-1)<0 ? 0: Math.round(prevData.speed-1)
                data.distanceInternal = Math.round(distanceInternal+ data.speed/3.6*t);
            }
            else {
                data.speed = (power===0 && speed<MIN_SPEED) ? 0 : speed;
                data.distanceInternal = (power===0 && speed<MIN_SPEED) ? Math.round(distanceInternal): Math.round(distanceInternal+distance);
            }
            data.power = Math.round(power);
            data.slope = slope;
            data.pedalRpm =  bikeData.pedalRpm || 0;

            if ( data.time!==undefined )
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