import { EventLogger } from 'gd-eventlog';
import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest,CyclingModeBase } from '../CyclingMode';
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT, DeviceAdapter } from '../Device';
import calc from '../calculations'


const config = {
    name: 'PowerMeter',
    description: 'Power and cadence are taken from device. Speed is calculated from power and current slope\nThis mode will not respect maximum power and/or workout limits',
    properties: []
}


export default class PowerMeterCyclingMode extends CyclingModeBase implements CyclingMode {

    logger: EventLogger;
    data: IncyclistBikeData;
    prevRequest: UpdateRequest;
    prevUpdateTS: number = 0;
    hasBikeUpdate: boolean = false;

    constructor(adapter: DeviceAdapter, props?: Settings) {
        super(adapter,props);
        const a = adapter as any
        this.logger = (a && a.getLogger) ? a.getLogger() : undefined;
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
        return {}    
    }    

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        if (request.slope)
            this.data.slope = request.slope;

        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest} );
        this.prevRequest = {}
        return {}
    }


    updateData(data: IncyclistBikeData):IncyclistBikeData {


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
            const a = this.adapter as any;            
            const m = a.getWeight ? a.getWeight() : DEFAULT_BIKE_WEIGHT+ DEFAULT_USER_WEIGHT;
            let duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec


            const vPrev = (prevData.speed || 0 )/3.6
            const EkinPrev = 1/2*m*vPrev*vPrev;
                    
            let powerRequired = calc.calculatePower(m,vPrev,prevData.slope||0);
            const powerDelta = powerRequired - power;
            const Ekin = EkinPrev-powerDelta*duration;
            const v = Math.sqrt(2*Ekin/m);
            speed = v*3.6


            //speed = calc.calculateSpeed (m, power, slope)
            //let v = speed/3.6;

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