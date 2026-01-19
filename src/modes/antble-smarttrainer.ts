import ICyclingMode, { CyclingModeConfig, CyclingModeProperyType, UpdateRequest } from "./types";
import PowerBasedCyclingModeBase from "./power-base";
import { IAdapter, IncyclistBikeData } from "../types";
import calc, { calculateVirtualSpeed } from "../utils/calculations";
import { useFeatureToggle } from "../features";
import { intVal } from "../utils/utils";


export type VirtshiftMode = 'Disabled' |  'SlopeDelta' | 'Adapter' | 'Simulated';

const MIN_POWER = 25;
export default class SmartTrainerCyclingMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static config ={
        name: "Smart Trainer",
        isSIM: true,
        description: "Calculates speed based on power and slope. Slope is set to the device",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
            {key:'slopeAdj', name:'Bike Reality Factor', description:'Percentage of slope that should be sent to the SmartTrainer. Should be used in case the slopes are feeling too hard', type: CyclingModeProperyType.Integer,default:100,min:0, max:200},
            {key:'slopeAdjDown', name:'Bike Reality Factor downhill', description:'Percentage of slope that should be sent during downhill sections. Should be used to avoid spinning out', type: CyclingModeProperyType.Integer,default:50,min:0, max:100},
        ]
    }

    protected gearDelta: number  = 0
    protected gear: number
    protected tsStart: number

    protected simPower: number
    protected simSlope: number
    protected maintainPower: number
    protected prevData
    protected prevEkin: number
    protected prevSimPower: number

    protected readonly gearRatios = [
        0.75, 0.87, 0.99, 1.11, 1.23, 1.38, 1.53, 1.68, 1.86, 2.04, 2.22, 2.40,
        2.61, 2.82, 3.03, 3.24, 3.49, 3.74, 3.99, 4.24, 4.54, 4.84, 5.14, 5.49
    ];


    constructor(adapter: IAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('SmartTrainerMode')
    }


    getBikeInitRequest(): UpdateRequest {
        const virtshiftMode = this.getVirtualShiftMode();

        if (virtshiftMode==='Adapter' ) {
            this.gear = intVal(this.getSetting('startGear'))
            const gearRatio = this.gearRatios[this.gear-1]
            return {slope:0, gearRatio, isHub:true}
        }

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

    resetConfig(): void {
        const config = this.getConfig()

        const virtshiftIdx = config.properties.findIndex(p => p.key==='virtshift');
        if (virtshiftIdx!==-1) {
            config.properties.splice(virtshiftIdx,1)
        }

        let startGearIdx = config.properties.findIndex(p => p.key==='startGear');
        if (startGearIdx!==-1) {
            config.properties.splice(startGearIdx,1)
        }
        
    }

    getConfig(): CyclingModeConfig {
        const config  = super.getConfig();

        const virtShiftEnabled =this.getFeatureToogle().has('VirtualShifting')


        let virtshift = config.properties.find(p => p.key==='virtshift');
        let startGear = config.properties.find(p => p.key==='startGear');

        if (!virtshift && !this.adapter?.supportsVirtualShifting()) {
            // add virtual shifting info
            const options= virtShiftEnabled ? [
                'Disabled',
                { key:'Incyclist', display:'App only (beta)' },
                { key: 'Mixed', display: 'App + Bike' }
            ] :
            [
                'Disabled',
                { key: 'Mixed', display: 'Enabled' }

            ]

            virtshift = {key:'virtshift', name: 'Virtual Shifting', description: 'Enable virtual shifting', type: CyclingModeProperyType.SingleSelect, options, default: 'Disabled'}
            config.properties.push( virtshift )
        }
        
        if (!virtshift && virtShiftEnabled && this.adapter?.supportsVirtualShifting()) {            
            const options = [
                'Disabled',
                { key: 'Incyclist', display:'App only (beta)' },
                { key: 'Mixed', display: 'App + Bike' },
                { key:'SmartTrainer', display: 'SmartTreiner (beta)' }
            ]            

            virtshift = {key:'virtshift', name: 'Virtual Shifting', description: 'Enable virtual shifting', type: CyclingModeProperyType.SingleSelect, options, default: 'Mixed'}
            config.properties.push( virtshift )
        }

        if (virtshift && !startGear) {
            startGear = {key:'startGear', name: 'Initial Gear', description: 'Initial Gear', type: CyclingModeProperyType.Integer,default:12,min:1, max:24,condition: (s)=> s?.virtshift==='Incyclist'||s?.virtshift==='SmartTrainer' }
            config.properties.push(startGear)

        }
        
        return config;
    }

    protected checkSlopeNoShiftig(request: UpdateRequest, newRequest: UpdateRequest={}) { 
        if (request.slope!==undefined) {
            const targetSlope = newRequest.slope = Number.parseFloat(request.slope.toFixed(1));
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


    protected checkSlopeWithAdapterShifting(request: UpdateRequest, newRequest: UpdateRequest={}) { 
        this.checkSlopeNoShiftig(request,newRequest);

        // enforce to add gearRatio on every request that is sent
        const gear = this.gear ?? this.getSetting('startGear')
        newRequest.gearRatio = this.gearRatios[gear-1];
        newRequest.isHub = true;

    }

    protected getSlopeDelta()  {
        return this.gearDelta*0.5
    }

    protected checkSlopeWithSlopeDelta(request: UpdateRequest, newRequest: UpdateRequest={}) { 
        if (request.slope!==undefined) {
            const targetSlope = newRequest.slope = Number.parseFloat(request.slope.toFixed(1))
            this.data.slope = newRequest.slope;

            const requestedSlope = targetSlope + this.getSlopeDelta();
            try {
                const slopeAdj = requestedSlope>=0 ? this.getSetting('slopeAdj') : this.getSetting('slopeAdjDown')               
                newRequest.slope = slopeAdj!==undefined ? requestedSlope * slopeAdj / 100 : requestedSlope
            }
            catch {
                console.error('# Error calculating requested slope');
            }
            
        }
    }
    protected checkSlopeWithSimulatedShifting(request: UpdateRequest, newRequest: UpdateRequest={}) { 
        // simPower already set
        if (this.simPower)
            return

        if (this.gear===undefined) { 
            this.checkSlopeNoShiftig(request,newRequest);
            return
        }


        if (request.slope===undefined ) {
            // console.log('# set simulated power (same slope):', {simPower:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope, cadence:this.data.pedalRpm, power:this.data.power})                    
            // this.logger.logEvent({message:'set simulated power (same slope)', simPower:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope, cadence:this.data.pedalRpm, power:this.data.power})                    
        }
        else {
            const prev = this.data.slope??0
            this.data.slope = Number.parseFloat(request.slope.toFixed(1));
            delete request.slope
            delete newRequest.slope;

            this.simSlope = this.data.slope;
            try {
                const slopeAdj = this.simSlope>=0 ? this.getSetting('slopeAdj') : this.getSetting('slopeAdjDown')
                if (slopeAdj!==undefined)
                    this.simSlope = this.simSlope * slopeAdj/100
            }
            catch {

            }
            this.calculateSimulatedPower('slope')
            this.verifySimPower()
        }

        newRequest.targetPower = this.simPower;

    }

    checkSlope(request: UpdateRequest, newRequest: UpdateRequest={}) {  
        const virtshiftMode = this.getVirtualShiftMode();

        switch (virtshiftMode) {
            case 'SlopeDelta':
                this.checkSlopeWithSlopeDelta(request,newRequest);
                break;
            case 'Simulated':
                this.checkSlopeWithSimulatedShifting(request,newRequest);
                break;
            case 'Adapter':
                this.checkSlopeWithAdapterShifting(request,newRequest);
                break;
            case 'Disabled':
            default:
                this.checkSlopeNoShiftig(request,newRequest);
                break;
        }


    }

    checkCadenceChange(request: UpdateRequest, newRequest: UpdateRequest={}) {  
        const virtshiftMode = this.getVirtualShiftMode();
        // if ( virtshiftMode!=='Simulated' || request.targetPower!==undefined || request.targetPowerDelta!==undefined || request.gearDelta!==undefined || request.gearRatio!==undefined) {    
        //     return
        // }

        if ( virtshiftMode!=='Simulated') {    
            return
        }

        if ( request.targetPower!==undefined || request.targetPowerDelta!==undefined || request.gearDelta!==undefined || request.gearRatio!==undefined) {    
            return
        }

        if (this.data.pedalRpm!==this.prevData.pedalRpm) {
            this.logger.logEvent({message:'cadence changed', cadence:this.data.pedalRpm, prevCadence:this.prevData.pedalRpm})            
            //this.calculateSimulatedPower('cadence')
            request.slope = request.slope??this.data.slope
        }

    }

    calculateSimulatedPower(changed?:string) {
        if (this.simPower)
            return

        const m = this.adapter?.getWeight()??85
        const vCurrent = this.data.speed * 1000 / 3600;
        const eKinCurrent = m * vCurrent * vCurrent / 2;


        if (this.data.pedalRpm>0) {
            const virtualSpeed = calculateVirtualSpeed(this.data.pedalRpm, this.gearRatios[this.gear-1])*3.6;
            const v = virtualSpeed/3.6

            // power required to maintain current cadence at given slope   
            const newPower = calc.calculatePower(m, virtualSpeed/3.6, this.simSlope??0);
            const prevPower = this.data.power;
            const prev= (this.prevSimPower??prevPower??0)
            const delta = newPower-prev


            if (!this.prevEkin  && this.data.isPedalling )  {
                // starting ...
                this.simPower = prev+delta/2 // 2 seconds to adjust
                this.simPower = Math.max(newPower, prevPower);
                this.prevEkin = m * v*v/2
                this.logger.logEvent({message:'set simulated power (starting)', target:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope,prevTarget:this.prevSimPower,  actualPower:prevPower, newPower})
            }
            else if (changed==='gear') {
                this.simPower = prev+delta // immediate adjustment
                this.prevEkin = m * v*v/2
                this.logger.logEvent({message:'set simulated power (gear change)', target:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope,prevTarget:this.prevSimPower,  actualPower:prevPower, newPower})

            }
            else if (changed==='slope' || changed==='cadence') {
                const adjustTime = this.simSlope < 0 ? 5 : 3
                this.simPower = prev+delta/adjustTime // 3 seconds to adapt
                this.logger.logEvent({message:`set simulated power (${changed} change)`, target:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope,prevTarget:this.prevSimPower,  actualPower:prevPower, newPower})
            }
            else { // nothing changed
                this.logger.logEvent({message:`set simulated power (mothing changed)`, target:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope,prevTarget:this.prevSimPower,  actualPower:prevPower, newPower})
            }
            
        }
        else {
            delete this.simPower
            if (this.data.speed<5) {
                delete this.prevEkin
            }
        }

    }

    checkGearChange(request: UpdateRequest, newRequest: UpdateRequest={}) {  
        const virtshiftMode = this.getVirtualShiftMode();
        

        switch (virtshiftMode) {
            case 'SlopeDelta':
                if (request.gearDelta!==undefined) {
//                    console.log(new Date().toISOString(), '# slopeDelta', request.gearDelta, 'from', this.gear   )
                    this.gearDelta += request.gearDelta;
                    request.slope = this.data.slope; // force slope to be reprocessed

                    delete request.gearDelta
                }
                break;
            case 'Simulated':
                if (request.gearDelta!==undefined) {
                    const oldGear = this.gear
//                    console.log(new Date().toISOString(), '# gearDelta', request.gearDelta, 'from', this.gear   )
                    if (this.gear===undefined) {
                        const initialGear = intVal(this.getSetting('startGear'))
                        this.gear = initialGear + (intVal(request.gearDelta)??0)
                    }
                    else { 
                        this.gear += (intVal(request.gearDelta)??0);
                    }
                    if (this.gear<1) {
                        this.gear = 1;
                    }
                    if (this.gear>this.gearRatios.length) {
                        this.gear = this.gearRatios.length;
                    }
                    delete request.gearDelta

                    this.logger.logEvent( {message:'gear changed', gear:this.gear, oldGear})
                    this.data.gearStr = this.getGearString()
                    this.calculateSimulatedPower('gear')
                    if (this.simPower!==undefined) {                        
                        newRequest.targetPower = this.simPower                        
                    }


                }
                break;
            case 'Adapter':
                if (request.gearRatio!==undefined) {
                    const oldGear = this.gear;
                    newRequest.gearRatio = request.gearRatio
                    if (this.gear===undefined) {

                        const requestedRatio = request.gearRatio;
                        let closestIndex = 0;
                        let minDiff = Math.abs(this.gearRatios[0] - requestedRatio);

                        for (let i = 1; i < this.gearRatios.length; i++) {
                            const diff = Math.abs(this.gearRatios[i] - requestedRatio);
                            if (diff < minDiff) {
                                minDiff = diff;
                                closestIndex = i;
                            }
                        }
                        this.gear = closestIndex+1;
                        this.logger.logEvent( {message:'gear changed', gear:this.gear, gearRatio:newRequest.gearRatio, oldGear})                        
                    }

                }
                else if (request.gearDelta!==undefined) {
                    const oldGear = this.gear;
                    if (this.gear===undefined) {
                        const initialGear = intVal(this.getSetting('startGear'))
                        this.gear = initialGear +request.gearDelta
                    }
                    else { 
                        this.gear += request.gearDelta;
                    }
                    if (this.gear<1) {
                        this.gear = 1;
                    }
                    if (this.gear>this.gearRatios.length) {
                        this.gear = this.gearRatios.length;
                    }
                    delete request.gearDelta
                    newRequest.gearRatio = this.gearRatios[this.gear]
                    this.logger.logEvent( {message:'gear changed', gear:this.gear, gearRatio:newRequest.gearRatio, oldGear})                        



                }
                else {
                    if (this.gear===undefined) {
                        const initialGear = intVal(this.getSetting('startGear'))
                        this.gear = initialGear +request.gearDelta
                    }

                    newRequest.gearRatio = this.gearRatios[this.gear]
                    this.logger.logEvent( {message:'gear initialized', gear:this.gear, gearRatio:newRequest.gearRatio})                        
                }


                break;
            case 'Disabled':
            default:
                break;
        }


    }

    protected verifySimPower() {
        if (this.simPower < 0) {
            this.simPower = 0;
        }

        if (this.data.pedalRpm > 0 && this.simPower < MIN_POWER) {
            this.simPower = MIN_POWER;
        }

        if (!this.data.isPedalling) {
            delete this.simPower
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

    protected getVirtualShiftMode():VirtshiftMode {

        try {
            if (!this.getFeatureToogle().has('VirtualShifting')) {
                return 'Disabled'
            }

            const virtshiftMode = this.getSetting('virtshift');

            if (virtshiftMode === 'Disabled') {
                return 'Disabled';
            } 
            else if (virtshiftMode==='Incyclist') {
                return 'Simulated'
            }
            else if (virtshiftMode==='SmartTrainer') {
                return 'Adapter'
            }
            else if (virtshiftMode==='Mixed') {
                return 'SlopeDelta'
            }
            else if (virtshiftMode === 'Enabled') {
                return this.adapter?.supportsVirtualShifting() ? 'Adapter' : 'Simulated';
            }
        }
        catch(err) {
            this.logger.logEvent({message:'error', fn:'getVirtualShiftMode', error:err.message,  stack:err.stack})
        }
        return 'Disabled'
    }

    updateData(bikeData: IncyclistBikeData, log?: boolean): IncyclistBikeData {

        const prev = this.prevData = {...this.data}

        const data = super.updateData(bikeData,log);

        const mode = this.getVirtualShiftMode();
        let virtualSpeed
        data.gearStr = this.getGearString()

        if (mode!=='Simulated')  {
            return data
        }

        if (data.power>0 && !this.tsStart) {
            this.tsStart = Date.now();
        }
        if (this.gear===undefined && this.tsStart && data.power>0 && (Date.now() - this.tsStart > 3000)) { 
            this.gear = Number(this.getSetting('startGear'))??0
            data.gearStr = this.getGearString()
        }
        return data
    }

    getData(): Partial<IncyclistBikeData> {
        const gearStr = this.getGearString();
        const data = super.getData();

        return {...data,gearStr}
    }

    protected updateRequired(request?: UpdateRequest): boolean {

        const virtshiftMode = this.getVirtualShiftMode();
        if (virtshiftMode==='Adapter' || virtshiftMode==='Simulated') {
            return true;
        }
        return super.updateRequired(request);
    }

    sendBikeUpdate(incoming: UpdateRequest): UpdateRequest {
        this.logger.logEvent( {message:"processing update request",request:incoming,prev:this.prevRequest,data:this.getData()} );        

        let newRequest:UpdateRequest = {}
        const request = {...incoming}

        delete this.simPower
        try {

            const req = this.checkForResetOrEmpty(request)
            if (req) {
                return req
            }

            this.checkCadenceChange(request,newRequest) 
            this.checkGearChange(request,newRequest)
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

        if (newRequest.targetPower && this.simPower) {
            this.prevSimPower = newRequest.targetPower
        }
            
        return newRequest
        
    }


    protected getGearString(): string {
        const mode = this.getVirtualShiftMode();

        if (mode==="Disabled")
            return undefined

        if ( mode==='Simulated') {
            this.gear = this.gear ?? Number(this.getSetting('startGear') ?? 0)
            return this.gear.toString()
        }

        if (mode==="SlopeDelta")
            return this.gearDelta >0 ? `+${this.gearDelta}` : `${this.gearDelta}`;

        if (mode==='Adapter') {
            this.gear = this.gear ?? Number(this.getSetting('startGear')  ?? 1)
            return this.gear.toString()
        }

        return this.gear?.toString()        
    }   

    protected getFeatureToogle() {
        return useFeatureToggle()
    }

}