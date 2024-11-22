import ICyclingMode, { CyclingModeProperyType, IVirtualShifting, UpdateRequest } from "./types";
import PowerBasedCyclingModeBase from "./power-base";
import { IAdapter } from "../types";
import calc from '../utils/calculations'

const NUM_GEARS = 30

export type GearConfigEntry = { chainConfig: number[], cassetteConfig: number[], wheelCirc: number, numGears: number }

const GearConfig:Record<string,GearConfigEntry> = {
    race: { chainConfig:[34,50], cassetteConfig:[11,36], wheelCirc: 2125, numGears: NUM_GEARS },
    mountain: { chainConfig:[26,36], cassetteConfig:[10,44], wheelCirc: 2344, numGears: NUM_GEARS },
    triathlon_org: { chainConfig:[36,52], cassetteConfig:[11,30], wheelCirc: 2125, numGears: NUM_GEARS },
    triathlon: { chainConfig:[39,39], cassetteConfig:[12,13,14,15,16,17,19,21,23,25],wheelCirc: 2096, numGears: 10}
}

export default class SmartTrainerCyclingMode extends PowerBasedCyclingModeBase implements ICyclingMode, IVirtualShifting {

    protected static config ={
        name: "Smart Trainer",
        isSIM: true,
        description: "Calculates speed based on power and slope. Slope is set to the device",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
            {key:'slopeAdj', name:'Slope Adjustment', description:'Percentage of slope that should be sent to the SmartTrainer. Should be used in case the slopes are feeling too hard', type: CyclingModeProperyType.Integer,default:100,min:0, max:200}
        ]
    }

    protected gear;

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
        if (request.slope!==undefined || this.gear!==undefined) {

            const slope  = request.slope ?? this.getData().slope

            newRequest.slope = parseFloat(slope.toFixed(1));
            this.data.slope = newRequest.slope;

            try {
                if (this.gear!==undefined) {
                    const slopeTarget = this.switchGear(this.gear,this.gear)
                    newRequest.slope = slopeTarget
                }

                const slopeAdj = this.getSetting('slopeAdj')
                if (slopeAdj!==undefined)
                    newRequest.slope = newRequest.slope * slopeAdj/100
            }
            catch (err) {
                this.logger.logEvent( {message:"error",fn:'',error:err.message, request,prev:this.prevRequest,data:this.getData()} );
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
        const request = Object.assign({},incoming)

        try {

            const req = this.checkForResetOrEmpty(request)
            if (req)
                return req

            this.checkSlope(request,newRequest)

            // if the request object is empty at this point, we just refresh the prev request
            this.checkEmptyRequest(newRequest); 

            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        }
                
        catch ( err)  /* istanbul ignore next */ {
            // I'm not expecting any error here, but just in case, if we catch anything we'll log
            this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message,stack:err.stack} );
        }
            
        return newRequest
        
    }

    async initGears(): Promise<number> {

        this.gear = this.findBestGear();
        return this.gear;
    }
    async gearUp(numGears: number): Promise<number> {
        let target = this.gear + numGears;

        const maxGear = this.getCurrentGearConfig()?.numGears ?? NUM_GEARS
        if (target > maxGear) 
            target = maxGear;
        if (target < 1)
            target=1

        this.gear = target
        return this.gear
    }

    protected switchGear = (gear,prevGear) => {

        const {chainConfig,cassetteConfig,wheelCirc,numGears} = this.getCurrentGearConfig()        
        const {pedalRpm,speed,power,slope} = this.getData()??{}
        const m = this.getWeight()

        let cadence = pedalRpm??this.getDefaultCadence()
        let currentPower = power??this.getDefaultPower()

        const prevGearSpeed = calc.calculateSpeedBike( prevGear, cadence,  chainConfig, cassetteConfig, {numGears, wheelCirc} )
        const targetGearSpeed = calc.calculateSpeedBike( gear, cadence,  chainConfig, cassetteConfig, {numGears, wheelCirc} )


        const targetGearPower = calc.calculatePower(m,targetGearSpeed/3.6,0)
        const prevGearPower = calc.calculatePower(m,prevGearSpeed/3.6,0)

        /*
        const vPrev = (prevSpeed )/3.6
        const EkinPrev = 1/2*m*vPrev*vPrev;

        const vNew = (speed )/3.6
        const EkinNew = 1/2*m*vNew*vNew;

        const powerDelta = (EkinNew - EkinPrev)/3;
        const slopeTargetA = C.calculateSlope(m, power, (speedInApp)/3.6);
        const slopeTargetB = C.calculateSlope(m, power+(power2-power1), (speedInApp)/3.6);

        //power = power+ powerDelta 
        */
        const targetPower = currentPower+(targetGearPower-prevGearPower)
        const slopeTarget = calc.calculateSlope(m,targetPower, speed/3.6);
        

        console.log('Gear',gear,'power',targetPower, 'speed', speed.toFixed(1),'slope',slope.toFixed(1),'virtual slope',slopeTarget.toFixed(1))        

        return slopeTarget
    }

    protected findBestGear() {

        const {chainConfig,cassetteConfig,wheelCirc,numGears} = this.getCurrentGearConfig()        
        const {pedalRpm,speed,power,slope} = this.getData()??{}
        const m = this.getWeight()

        let cadence = pedalRpm??this.getDefaultCadence()
        let currentPower = power??this.getDefaultPower()

        let minDiff, gearInitial

        if (speed===0) {            
            const speedInitial = calc.calculateSpeed(m,currentPower,slope)
            for (let i=1;i<=numGears;i++) {
                const speed = calc.calculateSpeedBike( i, cadence,  chainConfig, cassetteConfig, {numGears, wheelCirc} )
    
    
                const diff = Math.abs(speed - speedInitial)
                if (!minDiff || diff<minDiff) {
                    minDiff = diff
                    gearInitial = i
                }
    
            }
    
        }
        else {
            let info = []
            for (let i=1;i<=numGears;i++) {
                const speed = calc.calculateSpeedBike( i, cadence,  chainConfig, cassetteConfig, {numGears, wheelCirc} )
                const targetPower = calc.calculatePower(m,speed/3.6,slope)    
    
                const diff = Math.abs(currentPower - targetPower)
                if (!minDiff || diff<minDiff) {
                    minDiff = diff
                    gearInitial = i
                }
                info.push('gear: '+i+' speed: '+speed.toFixed(1)+' power: '+targetPower.toFixed(0))
                
            }
            info.push('selected: '+gearInitial)

            console.log('~~~ INFO',info.join('\n'))
            this.logger.logEvent({message:'gear info',info:info.join('|')})

        }


        return gearInitial



    }
    getCurrentGearConfig():GearConfigEntry {
        const type = this.getSetting('bikeType')??'Race'
        return GearConfig[type.toLowerCase()]

    }

    protected getDefaultCadence() {
        return 90
    }

    protected getDefaultPower() {
        return 120
    }
   



}