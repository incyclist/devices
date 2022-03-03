import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, Settings, UpdateRequest,CyclingModeBase } from "../CyclingMode";
import DaumAdapter from "./DaumAdapter";
import calc from '../calculations'


const config = {
    name: "PowerMeter",
    description: "Power and cadence are taken from device. Speed is calculated from power and current slope\nThis mode will not respect maximum power and/or workout limits",
    properties: []
}


export default class PowerMeterCyclingMode extends CyclingModeBase implements CyclingMode {

    logger: EventLogger;
    data: IncyclistBikeData;
    prevRequest: UpdateRequest;
    prevUpdateTS: number = 0;
    hasBikeUpdate: boolean = false;


    constructor(adapter: DaumAdapter, props?: Settings) {
        super(adapter,props);
        this.logger = adapter ? adapter.logger : undefined;
        if (!this.logger) this.logger = new EventLogger('PowerMeter')      
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
        if (request.slope)
            this.data.slope = request.slope;

        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest} );
        this.prevRequest = {}
        return {}
    }


    updateData(data: IncyclistBikeData) {


        try {
            const prevData = this.data || {} as any;
            const prevRequest = this.prevRequest || {} as any;
            const bikeData = JSON.parse(JSON.stringify(data));

            let power = data.power || 0;
            let speed = data.speed || 0

            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
            let distanceInternal = prevData.distanceInternal || 0;  // meters

            
            if (!bikeData.pedalRpm || bikeData.isPedalling===false) {
                speed = 0;
                power = 0;
            }

            // calculate speed and distance
            let ts = Date.now();
            const m = (this.adapter as DaumAdapter).getWeight();
            speed = calc.calculateSpeed (m, power, slope)
            let v = speed/3.6;
            let duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
            distanceInternal += Math.round(v*duration);
            

            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal);
            data.slope = slope;

            this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest:{},prevSpeed:prevData.speed} );

            this.data = JSON.parse(JSON.stringify(data));
            this.prevUpdateTS = ts       
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        return data;
        
    }



}