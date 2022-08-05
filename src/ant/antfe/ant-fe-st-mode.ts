import FtmsCyclingMode from "../../ble/ble-st-mode";
import { UpdateRequest } from "../../CyclingMode";
import { DeviceAdapter } from "../../Device";

export default class AntStCyclingMode extends FtmsCyclingMode {

    constructor(adapter: DeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntSTMode')
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
        if (request.slope===undefined && request.targetPower===undefined && request.refresh && this.prevRequest) {
            return this.prevRequest
        }

        if (request.slope!==undefined) {
            newRequest.slope = parseFloat(request.slope.toFixed(1));
            this.data.slope = newRequest.slope;
        }
        if (request.targetPower!==undefined) {
            newRequest.targetPower = request.targetPower
        }
        if (request.minPower && request.maxPower && request.minPower===request.maxPower) {
            newRequest.targetPower = request.minPower
        }

        const prevData = this.data;
        if ( newRequest.targetPower===undefined && prevData && prevData.power) {
            if ( request.minPower!==undefined  && prevData.power < request.minPower)
                newRequest.targetPower = request.minPower;
            if ( request.maxPower!==undefined  && prevData.power > request.maxPower)
                newRequest.targetPower = request.maxPower;
        }
        
        this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        return newRequest


    }


}