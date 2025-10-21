import ICyclingMode, { CyclingModeProperyType, UpdateRequest } from "./types";
import { IncyclistBikeData,IAdapter } from "../types";
import calc from '../utils/calculations'
import PowerBasedCyclingModeBase from "./power-base";

export type ERGEvent = {
    rpmUpdated?: boolean;
    gearUpdated?: boolean;
    starting?: boolean;
    tsStart?: number;
}


export default class ERGCyclingMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    prevRequest: UpdateRequest;
    hasBikeUpdate: boolean = false;
    chain: number[];
    cassette: number[];
    event: ERGEvent ={};

    protected static config = {
        isERG:true,
        name: "ERG",
        description: "Calculates speed based on power and slope. Power is either set by workout or calculated based on gear and cadence",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
            {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},
        ]
    }

    constructor(adapter: IAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('ERGMode')
    }

    getBikeInitRequest(): UpdateRequest {
        const startPower = this.getSetting('startPower');
        return { targetPower: startPower, init:true};
    }   

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        const getData= ()=>{
            if (!this.data) return {}
            const {gear,pedalRpm,slope, power,speed} = this.data;
            return {gear,pedalRpm,slope, power,speed} 
        }
        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest,data:getData(),event:this.event} );        

        let newRequest:UpdateRequest = {}
        let isRefreshOnly = request && request.refresh && Object.keys(request).length===1;
        let isInit = request && request.init

        try {

            if ( !request || request.reset || Object.keys(request).length===0 ) {
                this.prevRequest = {};
                return request||{};
            }

            const prevData = this.data || {} as any;
            if (request.slope!==undefined) {
                if (!this.data) this.data = {} as any;
                this.data.slope = request.slope;
            }
            this.checkForTempPowerAdjustments(request);

            if (request.targetPower!==undefined || request.gear!==undefined) {
                delete request.slope                
                delete request.refresh;               
            }

            // don't update below the startPower during the first 5 seconds of a ride or after a pause
            if (this.event.starting && request.targetPower===undefined) {
                const startPower = this.getSetting('startPower');
                if (this.event.tsStart && Date.now()-this.event.tsStart>5000) {
                    delete this.event.starting;
                    delete this.event.tsStart;
                }
                const target =this.calculateTargetPower(request);
                if (target<=startPower && (!request.minPower || target>=request.minPower)) {                    
                    return {};                    
                }
                else {
                    delete this.event.starting;
                    delete this.event.tsStart;
                }                
            }

            // no slope change or targets change -> refresh
            if ( request.refresh) {
                
                delete request.refresh;
 
                if ( this.prevRequest!==undefined && this.prevRequest.targetPower!==undefined && !this.prevRequest.init)  {
                    newRequest.targetPower = this.prevRequest.targetPower;
                }
                else if (this.event.gearUpdated || this.event.rpmUpdated) {
                    newRequest.targetPower = this.calculateTargetPower(request);
                    
                }
                else if ( this.prevRequest!==undefined && Object.keys(this.prevRequest).length>0)  {
                    request = {...this.prevRequest};
                }
                else {
                    newRequest.targetPower = this.calculateTargetPower(request);
                }
                
            } 
            else {
                if (request.maxPower!==undefined && request.minPower!==undefined && request.maxPower===request.minPower) {
                    request.targetPower = request.maxPower;                
                }
        
                if (request.targetPower===undefined && request.gear===undefined) {
                    newRequest.targetPower = this.calculateTargetPower(request)
                }
                else {
                    if (!request.gear || request.targetPower!==undefined)
                        newRequest.targetPower = request.targetPower;
                }
                if (request.gear) {
                    newRequest.gear = request.gear
                }
                delete request.slope;
                
    
                if (request.maxPower!==undefined) {
                    if (newRequest.targetPower!==undefined && newRequest.targetPower>request.maxPower) {
                        newRequest.targetPower = request.maxPower;
                    }
                    newRequest.maxPower = request.maxPower;
                }
            
                if (request.minPower!==undefined) {
                    if (newRequest.targetPower!==undefined && newRequest.targetPower<request.minPower) {
                        newRequest.targetPower = request.minPower;
                    }
                    newRequest.minPower = request.minPower;
                }            
        
            }
            
            if (!isRefreshOnly && !isInit)
                this.prevRequest = JSON.parse(JSON.stringify(request));
            else if (isInit) 
                this.prevRequest = {}


            if ( newRequest.targetPower!==undefined && prevData.power!==undefined && newRequest.targetPower===prevData.power) {
                // no update needed
                delete newRequest.targetPower;
            }
    
    
    
        }
        
        catch ( err)  /* istanbul ignore next */ {
            this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message||err,stack:err.stack} );

        }

        this.event.gearUpdated = false
        this.event.rpmUpdated = false;
        return newRequest;



        
    }

    copyBikeData(data: IncyclistBikeData, bikeData: IncyclistBikeData): IncyclistBikeData {
        const newData = super.copyBikeData(data,bikeData)

        // special case Daum Ergos: Power(25W) might always be delivered, 
        // needs to be ignored if no pedalling is detected
        if (!bikeData.pedalRpm || bikeData.isPedalling===false) {
            newData.power = 0;
        }
        if (newData.gear===undefined) newData.gear = 0;
        return newData
    }

    updateData(bikeData: IncyclistBikeData) {
        try {
            const prevData = JSON.parse(JSON.stringify(this.getData()))
            this.cleanupPrevEvents();             
            this.checkIsStarting(prevData);

            const data = super.updateData(bikeData)

            // check of rpm or gear has changed, if so: set as event            
            this.checkForEvents(bikeData, prevData);
            return data;               
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message, stack:err.stack})
            return this.getData() as IncyclistBikeData
        }
    }

    private checkForEvents(bikeData: IncyclistBikeData, prevData: any) {
        if (bikeData.gear !== prevData.gear) {
            this.event.gearUpdated = true;
        }
        if (bikeData.pedalRpm && bikeData.pedalRpm !== prevData.pedalRpm) {
            this.event.rpmUpdated = true;
        }
    }

    private cleanupPrevEvents() {
        delete this.event.gearUpdated;
        delete this.event.rpmUpdated;
    }

    private checkIsStarting(prevData: any) {
        if (Object.keys(prevData).length === 0 || prevData.speed === undefined || prevData.speed === 0) {
            this.event.starting = true;
            this.event.tsStart = Date.now();
        }
    }

    calculateTargetPower(request, updateMode=true) {       
        const bikeType = this.getSetting('bikeType').toLowerCase();
        const defaultPower = this.getSetting('startPower');

        let m = this.getWeight();
        const prevData = this.data || {} as any;
        let target;

        if ( prevData.pedalRpm  && prevData.gear  && (!updateMode ||prevData.pedalRpm!==0)  ) {
            const speed = calc.calculateSpeedDaum(prevData.gear,prevData.pedalRpm,bikeType);
            var power = calc.calculatePower(m,speed/3.6,0,{bikeType});
            target = Math.round(power);
        }
        else {
            target = Math.round(request.targetPower || defaultPower);
        }        
        
        return target;
    }


    protected checkForTempPowerAdjustments(request: UpdateRequest) {
        const data = this.getData()
        if (request.targetPowerDelta && data?.gear) {
            if (Math.abs(request.targetPowerDelta)===5) // single gear
                request.gear = data.gear+Math.sign(request.targetPowerDelta)
            if (Math.abs(request.targetPowerDelta)===50) // multiple gears
                request.gear = data.gear+Math.sign(request.targetPowerDelta)*5

            delete request.targetPowerDelta;
        }
    }

    protected applyCadenceFixes(): boolean {
        return false    
    }


}