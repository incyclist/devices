import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, Settings, UpdateRequest } from "../../CyclingMode";
import SmartTrainerCyclingMode from "../SmartTrainerCyclingMode";
import DaumAdapter from "../DaumAdapter";


const config = {
    name: "Daum Classic",
    description: "The device calculates speed and power based on slope. Incyclist will not modify any values recived from the device\nThis mode will not respect maximum power and/or workout limits",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain'], default: 'Race'},
    ]
}


export default class DaumClassicCyclingMode extends SmartTrainerCyclingMode implements CyclingMode {
    constructor(adapter: DaumAdapter, props?: Settings) {
        super(adapter,props);
        this.logger = adapter ? adapter.logger : undefined;
        if (!this.logger) this.logger = new EventLogger('DaumClassic')      
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
        return {slope:0}
    }    

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
            
        // log request and context
        const getData= ()=>{
            if (!this.data) return {}
            const {gear,pedalRpm,slope, power,speed} = this.data;
            return {gear,pedalRpm,slope, power,speed} 
        }
        const event = {...this.event} as any;
        if (this.data===undefined) event.noData = true;
        if (request.slope!==undefined && (event.noData || Math.abs(request.slope-this.data.slope)>=0.1 )) event.slopeUpdate = true;
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

    updateData(data: IncyclistBikeData) {

        try {
            const prevData = this.data || {} as any;
            const prevRequest = this.prevRequest || {} as any;
            const bikeData = JSON.parse(JSON.stringify(data));

            let power = bikeData.power || 0;
            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
            let speed = bikeData.speed || 0

            let distanceInternal = prevData.distanceInternal || 0;  // meters

            let ts = Date.now();
            if (bikeData.pedalRpm===0 || bikeData.isPedalling===false) {
                speed = 0;
                power = 0;
            }
            else {
                const duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
                let v = speed/3.6;
                distanceInternal += (v*duration);
            }
        


            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.slope = slope;
            data.distanceInternal = distanceInternal;

            this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest:this.prevRequest||{},prevSpeed:prevData.speed,event:this.event} );

            this.data = JSON.parse(JSON.stringify(data));
            this.prevUpdateTS = ts;   
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        return data;
        
    }


}