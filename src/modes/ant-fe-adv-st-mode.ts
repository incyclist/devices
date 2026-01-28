import { IncyclistDeviceAdapter } from "../base/adpater.js";
import SmartTrainerCyclingMode from "./antble-smarttrainer.js";
import { UpdateRequest } from "./types.js";

const MAX_DEVIATION = 10;

export default class AntAdvSimCyclingMode extends SmartTrainerCyclingMode {

    constructor(adapter: IncyclistDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AdvmartTrainerMode')
    }

    getDescription(): string {
        return 'Sends Slope to device. Respects Limits (from workout or settings). Calculates speed based on power and slope. '
    }

    getConfig() {
        const config = super.getConfig()
        
        return {...config,name:'Advanced Smart Trainer'}
    }

    checkForResetOrEmpty(request: UpdateRequest):UpdateRequest|undefined {
        if ( !request || request.reset  ) {
            this.prevRequest = {};
            return {reset:true} 
        }        

        if (request.slope===undefined && request.targetPowerDelta===undefined && request.targetPower===undefined && request.refresh && this.prevRequest) {
            return this.prevRequest
        }

    }

    protected checkForTempPowerAdjustments(request: UpdateRequest, newRequest:UpdateRequest={}) {
        if (request.targetPowerDelta && this.prevRequest && this.prevRequest.targetPower) {
            newRequest.targetPower = this.prevRequest.targetPower + request.targetPowerDelta;
            if (newRequest.targetPower < 10)
                newRequest.targetPower = this.prevRequest.targetPower;
            delete request.targetPowerDelta;
        }
    }
    protected checkEmptyRequest(newRequest: UpdateRequest) {
        if (Object.keys(newRequest).length === 0) {
            if (this.prevRequest) {
                newRequest.slope = this.prevRequest.slope;                
                newRequest.targetPower = this.prevRequest.targetPower;                
                newRequest.refresh = true;
            }
        }
    }

    sendBikeUpdate(incoming: UpdateRequest): UpdateRequest { 

        this.logger.logEvent( {message:"processing update request",request:incoming,prev:this.prevRequest,data:this.getData()} );        

        let newRequest:UpdateRequest = {}
        const request = Object.assign({},incoming)
        try {

            const req = this.checkForResetOrEmpty(request)
            if (req)
                return req

            this.checkSlope(request,newRequest)

            let data = this.getData()

            // TODO: in case we switched to ERG Mode and we have a slope update, check if that new slope would bring us inside limits
            //       Switch back to   SIM Mode in that case
            
            if (data.power) {
                const {minPower,maxPower} = request;                
                let targetPower = request.targetPower 

                if (minPower!==undefined && maxPower!==undefined && minPower===maxPower)
                    targetPower = maxPower;

                if (targetPower!==undefined && Math.abs(data.power-targetPower)>MAX_DEVIATION ) 
                    newRequest.targetPower = targetPower;
                else if (minPower!==undefined && data.power<minPower)
                    newRequest.targetPower = minPower;
                else  if (request.maxPower!==undefined && data.power>request.maxPower)
                    newRequest.targetPower = maxPower;
                else if (this.prevRequest?.targetPower) {
                    newRequest.targetPower = this.prevRequest.targetPower
                }
                
                if (newRequest.targetPower) {
                    //delete newRequest.slope
                    this.checkForTempPowerAdjustments(request, newRequest)
                }        
            }

            this.checkEmptyRequest(newRequest); 

            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        }
        catch ( err)  /* istanbul ignore next */ {
            // I'm not expecting any error here, but just in case, if we catch anything we'll log
            this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message,stack:err.stack} );
        }
    
        return newRequest

    }


}