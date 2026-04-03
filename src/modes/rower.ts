import ICyclingMode, { Settings, UpdateRequest } from './types.js';
import { IncyclistBikeData } from "../types/index.js";
import PowerBasedCyclingModeBase from './power-base.js';
import { IncyclistDeviceAdapter } from '../base/adpater.js';

export default class RowerMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static  config = {
        name: 'Rower',
        description: 'Power and cadence are taken from device. Pace is calculated from power and cadence',
        properties: []
    }
    
    constructor(adapter: IncyclistDeviceAdapter, props?: Settings) {
        super(adapter,props);
        this.initLogger('RowerMode')
        this.data.slope=0;
    }


    getBikeInitRequest(): UpdateRequest {
        return {}    
    }    

    sendBikeUpdate(request: UpdateRequest = {}): UpdateRequest {
        this.logEvent( {message:"processing update request",request} );

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

    calculateSpeedAndDistance(power: number, _slope: number, _m: number, t: number, _props= {}) {
        if (power <= 0 || t === 0) {
            return { speed: 0, distance: 0 };
        }

        // Derive split (s/500m) from power: watts = 2.8 / (split/500)³
        const split = 500 * Math.cbrt(2.8 / power);

        // speed in km/h and distance in meters over interval t
        const speed    = (500 / split) * 3.6;
        const distance = t === 0 ? 0 : (t / split) * 500;

        this.data.speed = speed;
        return { speed, distance };
    }



}