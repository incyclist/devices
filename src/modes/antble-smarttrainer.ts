import ICyclingMode, { CyclingModeConfig, CyclingModeProperyType, UpdateRequest } from "./types";
import PowerBasedCyclingModeBase from "./power-base";
import { IAdapter, IncyclistBikeData } from "../types";
import calc, { calculateVirtualSpeed } from "../utils/calculations";


type VirtshiftMode = 'Disabled' |  'SlopeDelta' | 'Adapter' | 'Simulated';

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

    protected readonly gearRatios = [
        0.75, 0.87, 0.99, 1.11, 1.23, 1.38, 1.53, 1.68, 1.86, 2.04, 2.22, 2.40,
        2.61, 2.82, 3.03, 3.24, 3.49, 3.74, 3.99, 4.24, 4.54, 4.84, 5.14, 5.49
    ];


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

    getConfig(): CyclingModeConfig {
        const config  = super.getConfig();

        let virtshift = config.properties.find(p => p.key==='virtshift');
        if (!virtshift) {
            // add virtual shifting info
            virtshift = {key:'virtshift', name: 'Virtual Shifting', description: 'Enable virtual shifting', type: CyclingModeProperyType.SingleSelect, options:['Disabled','Enabled','Mixed'], default: 'Disabled'}
            config.properties.push( virtshift )
        }
        
        if (this.adapter.supportsVirtualShifting()) {
            virtshift.default = 'Enabled';
            virtshift.options = ['Disabled','Enabled']
        }
        
        return config;
    }

    protected checkSlopeNoShiftig(request: UpdateRequest, newRequest: UpdateRequest={}) { 
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


    protected checkSlopeWithAdapterShifting(request: UpdateRequest, newRequest: UpdateRequest={}) { 
        // TODO replace this implementation 
        return this.checkSlopeNoShiftig(request,newRequest);
    }

    protected getSlopeDelta()  {
        return this.gearDelta*0.5
    }

    protected checkSlopeWithSlopeDelta(request: UpdateRequest, newRequest: UpdateRequest={}) { 
        if (request.slope!==undefined) {
            const targetSlope = newRequest.slope = parseFloat(request.slope.toFixed(1))
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
        
        if (this.gear===undefined) { 
            this.checkSlopeNoShiftig(request,newRequest);
            return
        }


        if (request.slope!==undefined) {
            const prev = this.data.slope??0
            this.data.slope = parseFloat(request.slope.toFixed(1));
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


            if (this.data.slope!==prev) {
                const virtualSpeed = calculateVirtualSpeed(this.data.pedalRpm, this.gearRatios[this.gear-1]);
                const m = this.adapter?.getWeight()??85
                this.simPower = calc.calculatePower(m, virtualSpeed, this.simSlope??0);
                this.verifySimPower()
                this.logger.logEvent({message:'set simulater power', power:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope})

            }          
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
//                    console.log(new Date().toISOString(), '# gearDelta', request.gearDelta, 'from', this.gear   )
                    if (this.gear===undefined) {
                        this.gear = 10 +request.gearDelta
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
                    const virtualSpeed = calculateVirtualSpeed(this.data.pedalRpm, this.gearRatios[this.gear-1]);
                    const m = this.adapter?.getWeight()??85
                    
                    this.simPower = calc.calculatePower(m, virtualSpeed, this.simSlope??this.data.slope??0);
                    this.verifySimPower()
                    this.logger.logEvent({message:'set simulater power', power:this.simPower, gear:this.gear, simSlope:this.simSlope, routeSlope:this.data.slope})                    
                    
//                    console.log(new Date().toISOString(), '# sendAdapter Update',request)

                    this.adapter.sendUpdate({targetPower:this.simPower}) .then( ()=> {
//                        console.log(new Date().toISOString(), '# sendAdapter Update done',request)

                    })

                }
                break;
            case 'Adapter':
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
        const virtshiftMode = this.getSetting('virtshift');

        if (virtshiftMode === 'Disabled') {
            return 'Disabled';
        } 

        if (this.adapter.supportsVirtualShifting()) {
            if (virtshiftMode === 'Enabled') {
                return 'Adapter';
            }
        }
        else {
            return virtshiftMode==='Mixed'  ? 'SlopeDelta' : 'Simulated';

        }
    }

    updateData(bikeData: IncyclistBikeData, log?: boolean): IncyclistBikeData {

        const prev = {...this.data}

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
            this.setInitialGear(data)
            data.gearStr = this.getGearString()
        }
        else if (this.gear!==undefined ) { 
            if (prev.power!==data.power || prev.pedalRpm!==data.pedalRpm)  {
                virtualSpeed = calculateVirtualSpeed(data.pedalRpm, this.gearRatios[this.gear-1]);
                const m = this.adapter?.getWeight()??85
                this.simPower = calc.calculatePower(m, virtualSpeed, this.simSlope??data.slope??0);
                this.verifySimPower()
            }
        }

        return data
    }

    getData(): Partial<IncyclistBikeData> {
        const gearStr = this.getGearString();
        const data = super.getData();

        return {...data,gearStr}
    }

    sendBikeUpdate(incoming: UpdateRequest): UpdateRequest {

        this.logger.logEvent( {message:"processing update request",request:incoming,prev:this.prevRequest,data:this.getData()} );        

        let newRequest:UpdateRequest = {}
        const request = {...incoming}

        try {

            const req = this.checkForResetOrEmpty(request)
            if (req) {
                return req
            }

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
            
        return newRequest
        
    }

    protected setInitialGear(data:IncyclistBikeData) {
        const m = this.adapter?.getWeight()??85        
        const virtualSpeeds = this.gearRatios.map( r=>calculateVirtualSpeed(data.pedalRpm, r) )
        const requiredPowers = virtualSpeeds.map( v=>calc.calculatePower(m, v, data.slope??0) )

        const deltas = requiredPowers.map( (p,i) =>  ({gear:i+1, delta:Math.abs(p - data.power)}) )
        deltas.sort( (a,b) => a.delta-b.delta )

        this.gear = deltas[0].gear
        this.logger.logEvent( {message:'set initial gear', gear:this.gear, m, rpm:data.pedalRpm, power:data.power})
    }

    protected getGearString(): string {
        const mode = this.getVirtualShiftMode();

        if (mode==="Disabled")
            return undefined

        if ( mode==='Simulated' && (this.gear===undefined || this.gear===null)   )
            return '';

        if (mode==="SlopeDelta")
            return this.gearDelta >0 ? `+${this.gearDelta}` : `${this.gearDelta}`;

        return this.gear.toString()        
    }   

}