import ICyclingMode, { Settings, UpdateRequest } from './types';
import { IncyclistBikeData } from "../types";
import PowerBasedCyclingModeBase from './power-base';
import { IncyclistDeviceAdapter } from '../base/adpater';

export default class PowerMeterCyclingMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static  config = {
        name: 'PowerMeter',
        description: 'Power and cadence are taken from device. Speed is calculated from power and current slope\nThis mode will not respect maximum power and/or workout limits',
        properties: []
    }
    
    constructor(adapter: IncyclistDeviceAdapter, props?: Settings) {
        super(adapter,props);
        this.initLogger('PowerMeterMode')
        this.data.slope=0;
    }


    getBikeInitRequest(): UpdateRequest {
        return {}    
    }    

    sendBikeUpdate(request: UpdateRequest = {}): UpdateRequest {
        this.logger.logEvent( {message:"processing update request",request} );

        const prevData = this.data;
        const prevSlope = prevData.slope; 

        if (request.slope && request.slope!==prevSlope) {
            this.data.slope = request.slope;
            this.updateData(this.data,false);
        }

        return {}
    }

    copyBikeData(data: IncyclistBikeData, bikeData: IncyclistBikeData): IncyclistBikeData {
        const newData = super.copyBikeData(data,bikeData)

        // some devices don't provide cadence information
        // therefore we are settings "isPedalling" to true whenever power>0
        if (bikeData.power>0) {
            newData.isPedalling = true
        }
        return newData
    }



}