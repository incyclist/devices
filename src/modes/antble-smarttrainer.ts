import ICyclingMode, { CyclingModeProperyType, UpdateRequest } from "./types";
import PowerBasedCyclingModeBase from "./power-base";
import { IAdapter } from "../types";


export default class SmartTrainerCyclingMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static config ={
        name: "Smart Trainer",
        isSIM: true,
        description: "Calculates speed based on power and slope. Slope is set to the device",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
            {key:'slopeAdj', name:'Bike Reality Factor', description:'Percentage of slope that should be sent to the SmartTrainer. Should be used in case the slopes are feeling too hard', type: CyclingModeProperyType.Integer,default:100,min:0, max:200},
            {key:'slopeAdjDown', name:'Bike Reality Factor downhill', description:'Percentage of slope that should be sent during downhill sections. Should be used to avoid spinning out', type: CyclingModeProperyType.Integer,default:50,min:0, max:100}
        ]
    }

    constructor(adapter: IAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('SmartTrainerMode')
    }


    getBikeInitRequest(): UpdateRequest {
        this.prevRequest = {slope:0}
        return { slope:0};
    }    

    checkForResetOrEmpty(request: UpdateRequest):UpdateRequest|undefined {
        if ( !request || request.reset  ) {
            this.prevRequest = {};
            return {reset:true} 
        }        

        if (request.slope===undefined && request.refresh && this.prevRequest) {
            return this.prevRequest
        }

    }

    protected checkSlope(request: UpdateRequest, newRequest: UpdateRequest={}) { 
        if (request.slope!==undefined) {
            const targetSlope = newRequest.slope = parseFloat(request.slope.toFixed(1));
            this.data.slope = newRequest.slope;

            try {
                const slopeAdj = targetSlope>=0 ? this.getSetting('slopeAdj') : this.getSetting('slopeAdjDown')
                if (slopeAdj!==undefined)
                    newRequest.slope = newRequest.slope * slopeAdj/100
            }
            catch {

            }
            
        }

    }

    protected checkEmptyRequest(newRequest: UpdateRequest) {
        if (Object.keys(newRequest).length === 0) {
            if (this.prevRequest) {
                newRequest.slope = this.prevRequest.slope;                
                newRequest.refresh = true;
            }
        }
    }

    sendBikeUpdate(incoming: UpdateRequest): UpdateRequest {

        this.logger.logEvent( {message:"processing update request",request:incoming,prev:this.prevRequest,data:this.getData()} );        

        let newRequest:UpdateRequest = {}
        const request = {...incoming}

        try {

            const req = this.checkForResetOrEmpty(request)
            if (req)
                return req

            this.checkSlope(request,newRequest)

            // if the request object is empty at this point, we just refresh the prev request
            this.checkEmptyRequest(newRequest); 

            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
            this.prevRequest.slope = this.data.slope // don't use adjusted slope here as prevRequest will be used to update slope data in the future
        }
                
        catch ( err)  /* istanbul ignore next */ {
            // I'm not expecting any error here, but just in case, if we catch anything we'll log
            this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message,stack:err.stack} );
        }
            
        return newRequest
        
    }


}