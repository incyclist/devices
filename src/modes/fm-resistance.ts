import { IncyclistDeviceAdapter } from "../base/adpater.js";
import { IncyclistBikeData } from "../types/index.js";
import PowerBasedCyclingModeBase from "./power-base.js";
import ICyclingMode, { CyclingModeConfig, CyclingModeProperyType, UpdateRequest } from "./types.js";

const MIN_GEAR = 1
const MAX_GEAR = 26
const LEVELS_PER_GEAR = 4
const DEFAULT_MAX_SLOPE = 10
const DOWNHILL_FACTOR = 0.5
const UPDATE_THROTTLE_MS = 1000

type AutoResistanceStats = {
    updatesSent: number
    updatesFailed: number
    gearChanges: number
    targetMin?: number
    targetMax?: number
    tsStart?: number
}

export default class FMResistanceMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static config:CyclingModeConfig = {
        isERG:false,
        isSIM:false,
        isResistance:true,
        name: "Resistance",
        description: "Resistance levels are set by the app based on selected gear. Calculates speed based on power and slope.",
        properties: FMResistanceMode.buildProperties(false)
    }

    protected static buildProperties(autoDefault:boolean):CyclingModeConfig['properties'] {
        const isAuto = (s:any) => (s?.autoResistance ?? autoDefault) !== false && s?.autoResistance!=='false'

        return [
            {key:'startGear', name: 'Initial Gear', description: 'Initial Gear', type: CyclingModeProperyType.Integer,default:5,min:1, max:26},
            {key:'autoResistance', name: 'Auto Resistance', description: 'Adjusts the resistance automatically to the slope of the route. Gear shifts will increase/decrease the resistance on top of that', type: CyclingModeProperyType.Boolean, default:autoDefault},
            {key:'maxSlope', name: 'Max Slope', description: 'Slope (in %) at which the maximum resistance is reached. Downhill sections reduce the resistance at half of that rate', type: CyclingModeProperyType.Integer, default:DEFAULT_MAX_SLOPE, min:1, max:30, condition: isAuto }
        ]
    }

    protected confirmedResistance?: number;
    protected requestedResistance?: number;
    protected gearOffset: number = 0
    protected lastAutoSendTs: number = 0
    protected autoStats: AutoResistanceStats = { updatesSent:0, updatesFailed:0, gearChanges:0 }

    constructor(adapter: IncyclistDeviceAdapter, props?:any) {
        super(adapter,props);        
        this.initLogger('FMResistanceMode')
        this.data.slope=0;

    }

    /**
     * Sets the default of the autoResistance property (and the matching visibility of maxSlope), which 
     * depends on the capabilities of the adapter: it is only on by default if the device can't simulate slopes
     */
    setAutoResistanceDefault(autoDefault:boolean):void {
        const base = (this.constructor as typeof FMResistanceMode).config
        this.setConfig({...base, properties: FMResistanceMode.buildProperties(autoDefault)})
    }

    isAutoResistance():boolean {
        const value = this.getSetting('autoResistance')
        return value===true || value==='true'
    }

    getBikeInitRequest(): UpdateRequest {
        if (this.isAutoResistance()) {
            return { targetResistance: this.calculateAutoResistance( this.data.slope ?? 0 ) };
        }
        return { targetResistance: this.calculateTargetResistance( this.getInitialGear() )  };
    }   

    /**
     * To be called when the adapter is (re-)started: the gear offset (shifts) does not survive a restart
     */
    resetSession():void {
        this.gearOffset = 0
        this.lastAutoSendTs = 0
        this.autoStats = { updatesSent:0, updatesFailed:0, gearChanges:0 }
    }

    registerFailedUpdate():void {
        if (this.isAutoResistance())
            this.autoStats.updatesFailed++
    }

    logSummary():void {
        const stats = this.autoStats
        if (stats.updatesSent===0)
            return

        const durationSec = stats.tsStart ? Math.round((Date.now()-stats.tsStart)/1000) : 0
        this.logEvent({
            message:'auto resistance summary', 
            updatesSent: stats.updatesSent, updatesFailed: stats.updatesFailed, gearChanges: stats.gearChanges,
            targetMin: stats.targetMin ?? 0, targetMax: stats.targetMax ?? 0, durationSec
        })
        this.autoStats = { updatesSent:0, updatesFailed:0, gearChanges:0 }
    }

    sendBikeUpdate(incoming: UpdateRequest): UpdateRequest {
        if (this.logger)
            this.logEvent( {message:"processing update request",request:incoming,prev:this.prevRequest,data:this.getData()} );        

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
            if (this.isAutoResistance()) {
                this.checkAutoGearDeltaSet(request, newRequest);
            }
            else {
                this.checkGearDeltaSet(request, newRequest);
            }
            this.checkTargetResistanceSet(request, newRequest);
            if (this.isAutoResistance()) {
                this.checkAutoResistanceSet(newRequest);
            }
            this.checkRefresh(request,newRequest);   

            // if the request object is empty at this point, we just refresh the prev request
            this.checkEmptyRequest(newRequest); 
      
            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        }
        
        catch ( err)  /* istanbul ignore next */ {
            // I'm not expecting any error here, but just in case, if we catch anything we'll log
            if (this.logger)
                this.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message,stack:err.stack} );
        }

        if (newRequest.targetResistance!==undefined) { 
            this.requestedResistance = newRequest.targetResistance;
            if (this.isAutoResistance()) {
                this.recordAutoUpdate(newRequest.targetResistance)
            }
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

    protected getStartGear():number {
        const gear = Math.round(this.getInitialGear())
        if (Number.isNaN(gear))
            return MIN_GEAR
        return Math.min(Math.max(gear, MIN_GEAR), MAX_GEAR)
    }

    protected getMaxSlope():number {
        const maxSlope = Number(this.getSetting('maxSlope'))
        return (Number.isNaN(maxSlope) || maxSlope<=0) ? DEFAULT_MAX_SLOPE : maxSlope
    }

    // the offset is clamped, so that the virtual gear always stays within the valid range (also if the start gear was changed)
    protected getGearOffset():number {
        const startGear = this.getStartGear()
        return Math.min( Math.max( this.gearOffset, MIN_GEAR-startGear), MAX_GEAR-startGear)
    }

    protected getVirtualGear():number {
        return this.getStartGear() + this.getGearOffset()
    }

    /**
     * Resistance (0-100) for a given slope: the resistance of the start gear at 0%, increasing linearly 
     * to 100 at maxSlope. Downhill slopes only count with half of their gradient. 
     * Every gear shift adds/removes 4 levels on top
     */
    protected calculateAutoResistance(slope:number):number {
        const base = this.calculateTargetResistance( this.getStartGear() )
        const maxSlope = this.getMaxSlope()
        const s = Number.isFinite(slope) ? slope : 0
        const effective = s<0 ? s*DOWNHILL_FACTOR : s

        const resistance = base + (100-base)*effective/maxSlope + LEVELS_PER_GEAR*this.getGearOffset()
        return Math.round( Math.min( Math.max(resistance,0), 100) )
    }

    protected checkAutoGearDeltaSet(request: UpdateRequest, newRequest: UpdateRequest): void {
        if (request.gearDelta === undefined)
            return

        const startGear = this.getStartGear()
        const prevOffset = this.getGearOffset()
        const offset = Math.min( Math.max( prevOffset + request.gearDelta, MIN_GEAR-startGear), MAX_GEAR-startGear)
        delete request.gearDelta;

        if (offset!==prevOffset)
            this.autoStats.gearChanges++
        this.gearOffset = offset

        // gear shifts are never throttled
        newRequest.targetResistance = this.calculateAutoResistance(this.data.slope ?? 0)
    }

    protected checkAutoResistanceSet(newRequest: UpdateRequest): void {
        if (newRequest.targetResistance!==undefined)
            return

        // slope changes are applied at most once per second, the latest slope is applied at the next allowed update
        if (Date.now()-this.lastAutoSendTs < UPDATE_THROTTLE_MS)
            return

        const target = this.calculateAutoResistance(this.data.slope ?? 0)
        if (target!==this.requestedResistance)
            newRequest.targetResistance = target
    }

    protected recordAutoUpdate(target:number):void {
        const now = Date.now()
        const stats = this.autoStats
        this.lastAutoSendTs = now
        stats.tsStart = stats.tsStart ?? now
        stats.updatesSent++
        stats.targetMin = stats.targetMin===undefined ? target : Math.min(stats.targetMin, target)
        stats.targetMax = stats.targetMax===undefined ? target : Math.max(stats.targetMax, target)
    }

    updateData(bikeData: IncyclistBikeData, log?: boolean): IncyclistBikeData {
        const data = super.updateData(bikeData, log);

        if (this.isAutoResistance()) {
            // the displayed gear is the virtual gear, independent of the resistance reported by the bike
            data.gear = this.getVirtualGear()
            data.gearStr = `${data.gear}`
            return data
        }

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