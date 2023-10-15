import { EventLogger } from "gd-eventlog";
import ICyclingMode, { CyclingModeProperyType, Settings, UpdateRequest } from "./types";
import { IncyclistBikeData } from "../types";
import SmartTrainerCyclingMode from "./antble-smarttrainer";
import { IncyclistDeviceAdapter } from "../base/adpater";


const config = {
    name: "Daum Classic",
    description: "The device calculates speed and power based on slope. Incyclist will not modify any values recived from the device\nThis mode will not respect maximum power and/or workout limits",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain'], default: 'Race'},
    ]
}

type DaumClassicEvent = {
    noData?:boolean
    slopeUpdate?:boolean
    initialCall?:boolean
}


export default class DaumClassicCyclingMode extends SmartTrainerCyclingMode implements ICyclingMode {
    event: DaumClassicEvent

    constructor(adapter: IncyclistDeviceAdapter, props?: Settings) {
        super(adapter,props);
        this.logger = adapter ? adapter.getLogger() : undefined;
        if (!this.logger) this.logger = new EventLogger('DaumClassic')      
        this.setConfig(config)
        this.event = {noData:true,initialCall:true,slopeUpdate:false}
    }


    getBikeInitRequest(): UpdateRequest {
        return {slope:0}
    }    

    checkForResetOrEmpty(request: UpdateRequest):UpdateRequest|undefined {

        // no need to send any command and reset
        if ( !request || request.reset  ) {
            this.prevRequest = {};
            return {} 
        }

        if ( Object.keys(request).length===0 && this.prevRequest) {           
            return {slope:this.prevRequest.slope, refresh:true}
        }
        if (request.slope===undefined && request.refresh && this.prevRequest) {
            return this.prevRequest
        }

    }

    protected updateSpeedAndDistance(_power: number, _slope: any, _bikeType: any, data: IncyclistBikeData, prevData: any) {
        const distanceInternal = prevData.distanceInternal || 0;  // meters
        const t = this.getTimeSinceLastUpdate();

        if (data.pedalRpm===0 || data.isPedalling===false) {
            data.speed = 0;
            data.power = 0;

        }
        else {
            let v = data.speed/3.6;
            data.distanceInternal = distanceInternal + v*t;
        }
        return t;
    }

}