import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest } from '../CyclingMode';
import PowerBasedCyclingModeBase from './power-base';
import { DeviceAdapter } from '../Device';


export const config = {
    name: 'PowerMeter',
    description: 'Power and cadence are taken from device. Speed is calculated from power and current slope\nThis mode will not respect maximum power and/or workout limits',
    properties: []
}


export default class PowerMeterCyclingMode extends PowerBasedCyclingModeBase implements CyclingMode {

    constructor(adapter: DeviceAdapter, props?: Settings) {
        super(adapter,props);
        this.initLogger('PowerMeterMode')
        this.data = { speed: 0, slope:0 , power:0,  distanceInternal:0, pedalRpm:0, isPedalling:false, heartrate:0}
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

    sendBikeUpdate(request: UpdateRequest = {}): UpdateRequest {
        const prevData = this.data || {} as any;
        const prevSlope = prevData.slope || 0; 

        if (request.slope && request.slope!==prevSlope) {
            this.data.slope = request.slope;
            this.updateData(this.data,{log:false});
        }
        this.logger.logEvent( {message:"processing update request",request} );
        
        return {}
    }

    updateData(bikeData: IncyclistBikeData,props={log:true}):IncyclistBikeData {
        try {
            const prevData = this.data || {} as any;
            const data = JSON.parse(JSON.stringify(bikeData));

            let power = bikeData.power || 0;
            const slope = prevData.slope || 0; 
            const distanceInternal = prevData.distanceInternal || 0;  // meters
            if (!bikeData.pedalRpm || bikeData.isPedalling===false) {
                power = 0;
            }

            // calculate speed and distance
            const m = this.getWeight();
            let t =  this.getTimeSinceLastUpdate();
            const {speed,distance} = this.calculateSpeedAndDistance(power,slope,m,t);

            // update data
            data.speed = speed;
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal+distance);
            data.slope = slope;

            if(props.log)
                this.logger.logEvent( {message:"updateData result",data,bikeData ,prevSpeed:prevData.speed} );
            this.data = data;
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        return this.data;
        
    }


}