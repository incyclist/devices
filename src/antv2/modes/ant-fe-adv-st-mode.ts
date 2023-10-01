import { ControllableDeviceAdapter } from "../..";
import FtmsCyclingMode from "../../modes/ble-st-mode";
import { UpdateRequest } from "../../modes/cycling-mode";

const MAX_DEVIATION = 10;

export default class AntAdvSimCyclingMode extends FtmsCyclingMode {

    constructor(adapter: ControllableDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntAdvSimMode')
    }

    getName(): string {
        return 'Advanced Smart Trainer';
    }
    getDescription(): string {
        return 'Sends Slope to device. Respects Limits (from workout or settings). Calculates speed based on power and slope. '
    }

    sendBikeUpdate(request: UpdateRequest): UpdateRequest { 

        // log request and context
        const getData= ()=>{
            if (!this.data) return {}
            const {gear,pedalRpm,slope, power,speed} = this.data;
            return {gear,pedalRpm,slope, power,speed} 
        }
        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest,data:getData()} );

        let newRequest:UpdateRequest = {};

        if (request.slope===undefined && request.targetPower===undefined && request.refresh && this.prevRequest) {
            return this.prevRequest
        }

        if (request.slope!==undefined) {
            newRequest.slope = parseFloat(request.slope.toFixed(1));
            this.data.slope = newRequest.slope;
        }

        if (this.data && this.data.power) {
            const {minPower,maxPower} = request;
            let {targetPower} = request;
            if (minPower!==undefined && maxPower!==undefined && minPower===maxPower)
                targetPower = maxPower;

            if (targetPower!==undefined && Math.abs(this.data.power-targetPower)>MAX_DEVIATION )
                newRequest.targetPower = targetPower;
            else if (minPower!==undefined && this.data.power<minPower)
                newRequest.targetPower = minPower;
            else  if (request.maxPower!==undefined && this.data.power>request.maxPower)
                newRequest.targetPower = maxPower;
    
        }
        this.prevRequest = JSON.parse(JSON.stringify(newRequest));
 
        return newRequest


    }


}