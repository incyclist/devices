import { IncyclistDeviceAdapter } from "../base/adpater";
import { IncyclistBikeData } from "../types";
import PowerBasedCyclingModeBase from "./power-base";
import ICyclingMode, { CyclingModeProperyType, UpdateRequest } from "./types";

export default class FMResistanceMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static config = {
        isERG:false,
        isSIM:false,
        isResistance:true,
        name: "Resistance",
        description: "Resistance levels are set by the app based on selected gear. Calculates speed based on power and slope.",
        properties: [
            {key:'startGear', name: 'Initial Gear', description: 'Initial Gear', type: CyclingModeProperyType.Integer,default:5,min:1, max:26}
        ]
    }

    protected confirmedResistance?: number;
    protected requestedResistance?: number;

    constructor(adapter: IncyclistDeviceAdapter, props?:any) {
        super(adapter,props);        
        this.initLogger('FMResistanceMode')
        this.data.slope=0;

    }

    getBikeInitRequest(): UpdateRequest {
        return { targetResistance: this.calculateTargetResistance( this.getInitialGear() )  };
    }   

    sendBikeUpdate(incoming: UpdateRequest): UpdateRequest {
        if (this.logger)
            this.logger.logEvent( {message:"processing update request",request:incoming,prev:this.prevRequest,data:this.getData()} );        

        let newRequest:UpdateRequest = {}
        const request = {...incoming}

        try {

            const req = this.checkForResetOrEmpty(request)
            if (req) {
                delete req.refresh
                return req
            }

            // checks that might modify original request
            this.checkSlope(request);
            // checks that will set target request
            this.checkGearDeltaSet(request, newRequest);
            this.checkTargetResistanceSet(request, newRequest);
            this.checkRefresh(request,newRequest);   

            // if the request object is empty at this point, we just refresh the prev request
            this.checkEmptyRequest(newRequest); 
      
            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        }
        
        catch ( err)  /* istanbul ignore next */ {
            // I'm not expecting any error here, but just in case, if we catch anything we'll log
            if (this.logger)
                this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message,stack:err.stack} );
        }

        if (newRequest.targetResistance!==undefined) { 
            this.requestedResistance = newRequest.targetResistance;
        }

        return newRequest;        
    }

    checkForResetOrEmpty(request: UpdateRequest):UpdateRequest|undefined {
        if ( !request || request.reset  ) {
            this.prevRequest = {};
            return {reset:true} 
        }

        if ( Object.keys(request).length===0 && this.prevRequest) {           
            return {targetResistance:this.prevRequest.targetResistance, refresh:true}
        }

    }


    protected checkSlope(request: UpdateRequest) {
        if (request.slope !== undefined ) {
            this.data.slope = request.slope;
            delete request.slope;
        }
    }

    protected checkTargetResistanceSet(request: UpdateRequest, newRequest: UpdateRequest) {

        if (request.targetResistance!==undefined) {
            let resistance = Math.floor(request.targetResistance);
            resistance = Math.max( resistance, 0)
            resistance = Math.min( resistance, 100);
            newRequest.targetResistance=resistance
            delete request.refresh;
        }

    }


    protected checkGearDeltaSet(request: UpdateRequest, newRequest: UpdateRequest): void {
        let resistance = this.getCurrentResistanceTarget();
        let gear = this.getGear(resistance);

        if (request.gearDelta !== undefined) {
            gear += request.gearDelta;
            gear = Math.max( gear, 1)
            gear = Math.min( gear, 26);
            resistance = this.calculateTargetResistance(gear);
            newRequest.targetResistance = resistance;
            delete request.gearDelta;
        }
    }

    updateData(bikeData: IncyclistBikeData, log?: boolean): IncyclistBikeData {
        const data = super.updateData(bikeData, log);

        if (data.resistance!==undefined) {            
            data.gear = this.getGear(data.resistance);
            data.gearStr = `${data.gear}`;            

            if (this.getCurrentResistanceTarget()!==this.getCurrentResistance()) {               
                const gear = this.getGear(this.getConfirmedResistanceTarget())
            
                if (this.getCurrentResistanceTarget()===this.getConfirmedResistanceTarget()) {
                    data.gearStr = `${gear}`; 
                }
                else  if (this.getCurrentResistanceTarget()>this.getConfirmedResistanceTarget()) {
                    // add utf8 for  arrow up
                    data.gearStr = `${gear} \u2191`; 
                }
                else {
                    // add utf8 for  arrow down
                    data.gearStr = `${gear} \u2193`; 
                }
            }
        }
        return data
    }

    confirmed(request: UpdateRequest): void {
        if (request.targetResistance!==undefined) {
            this.confirmedResistance = request.targetResistance;
        }
    }


    protected getCurrentResistanceTarget():number {
        return this.requestedResistance ?? this.calculateTargetResistance( this.getInitialGear() );
    }
    protected getConfirmedResistanceTarget():number {
        return this.confirmedResistance 
    }

    protected getCurrentResistance():number {
        return this.getData().resistance;
    }

    protected getInitialGear():number {
        return Number(this.getSetting('startGear'))
    }

    protected getGear(resistance:number):number {
        let r = Math.max( resistance??0, 0)
        r = Math.min( r, 100);
        return Math.floor( r/4)+1;
    }

    protected calculateTargetResistance(gear:number):number {
        let g = Math.max( gear, 0)
        g = Math.min( g, 26);

        return (g-1)*4; // each gear is 4 resistance levels
    }
}