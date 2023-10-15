import { EventLogger } from "gd-eventlog";
import ICyclingMode, {  CyclingModeProperyType, Settings, UpdateRequest } from "./types";
import { IncyclistBikeData } from "../types";
import PowerMeterCyclingMode from "./power-meter";
import { IncyclistDeviceAdapter } from "../base/adpater";


export default class DaumClassicCyclingMode extends PowerMeterCyclingMode implements ICyclingMode {

    prevInternalDistance: number
    distanceOffset: number
    

    protected static config = {
        name: "Daum Classic",
        description: "The device calculates speed and power based on slope. Incyclist will not modify any values recived from the device\nThis mode will not respect maximum power and/or workout limits",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain'], default: 'Race'},
        ]
    }

    constructor(adapter: IncyclistDeviceAdapter, props?: Settings) {
        super(adapter,props);
        this.logger = adapter ? adapter.getLogger() : undefined;
        if (!this.logger) this.logger = new EventLogger('DaumClassic')      

        this.setModeProperty('eppSupport',true)
        this.setModeProperty('setPersonSupport',true)
    }


    getBikeInitRequest(): UpdateRequest {
        return {}
    }    


    updateData(data: IncyclistBikeData) {
        try {
            const prevData = Object.assign({},this.getData())
            const prevRequest = this.prevRequest || {}
            const bikeData = JSON.parse(JSON.stringify(data));

            let power = data.power || 0;
            let speed = data.speed || 0
            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike

            let distanceBike = data.distanceInternal || 0;
            let distancePrev = this.prevInternalDistance || 0
          
            let distanceInternal = distanceBike + (this.distanceOffset||0)

            let time = prevData.time||0;
            let ts = Date.now();
            let t = this.getTimeSinceLastUpdate()
            
            if (!bikeData.pedalRpm || bikeData.isPedalling===false) {
                speed = 0;
                power = 0;
            }

            if (distanceBike<distancePrev) /* overflow*/  {
                this.logger.logEvent( {message:'distance overflow', distanceBike, distancePrev} )   
                // calculate speed and distance
                let v = speed/3.6;

                const calculateDistance = distancePrev + (this.distanceOffset||0) + v*t 
                this.distanceOffset = calculateDistance-distanceBike
                distanceInternal = calculateDistance
                
            }

            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = distanceInternal;
            data.slope = slope;
            data.time = speed>0 ? time+t : time;

            this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest:{},prevSpeed:prevData.speed} );

            this.data = JSON.parse(JSON.stringify(data));

            this.prevUpdateTS = ts       
            this.prevInternalDistance = distanceBike
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        return data;

    }

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        super.sendBikeUpdate(request);
        this.prevRequest = {}
        return {}
    }


}