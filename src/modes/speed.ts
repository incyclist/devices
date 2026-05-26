import { IAdapter, IncyclistBikeData } from "../types";
import { CyclingModeBase } from "./base";
import ICyclingMode, { CyclingModeConfig, CyclingModeProperty, CyclingModeProperyType, Settings, UpdateRequest } from "./types";
import calc from '../utils/calculations.js'
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT, DEFAULT_WHEEL_CIRCUMFERENCE } from "../base/consts.js";

export default class SpeedCyclingMode extends CyclingModeBase implements ICyclingMode  {
    data: IncyclistBikeData;
    prevUpdateTS: number = 0;
    prevRequest: UpdateRequest|undefined;

    protected static config ={
        name: "SpeedSensor",
        description: "Calculates power based on speed and slope.",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
            {key:'wc',name: 'Wheel Circumference', description: 'Circumference in mm', type: CyclingModeProperyType.Integer, default: Math.ceil(DEFAULT_WHEEL_CIRCUMFERENCE*1000)},
        ]
    }


    constructor(adapter: IAdapter,   props?: Settings) {
        super(adapter,props);
        this.data = { speed: 0 , power:0,  distanceInternal:0, pedalRpm:0, isPedalling:false, heartrate:0}
    }

    getData(): Partial<IncyclistBikeData> {
        return this.data
    }

    getSlope():number {
        const {slope} = this.data
        return slope||0;
    }

    getWeight() {
        const a = this.adapter;
        const defaultWeight = DEFAULT_BIKE_WEIGHT+ DEFAULT_USER_WEIGHT;
        const m = (a) ? a.getWeight()||defaultWeight : defaultWeight;

        return m;
    }
    getTimeSinceLastUpdate() {

        const ts = Date.now();
        const duration = this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
        return duration
    }


    getBikeInitRequest(): UpdateRequest {
        return {}        
    }

    updateData(data: IncyclistBikeData, log:boolean=true): IncyclistBikeData {

        const prevData:IncyclistBikeData = this.data
        const prevRequest:UpdateRequest = this.prevRequest??{}
        const slope = ( prevRequest.slope!==undefined ? prevRequest.slope : prevData.slope ?? 0); // ignore slope delivered by bike
        const {pedalRpm=0} = data??{}

        const bikeType = this.getSetting('bikeType')?.toLowerCase();



        if (data.isPedalling===false || data.speed===0 ) {

            this.data = {
                ...data,
                speed:0,
                isPedalling:false,
                power:0,
                slope
            }

            this.prevUpdateTS = Date.now()
            return this.data
        }

        const m = this.getWeight();
        const t = this.getTimeSinceLastUpdate();
        const v = (data.speed??0)/3.6
        // get produced power on roller
    
        const power = calc.calculatePower(m,v,0,{bikeType})
        //const {power} = this.calculatePowerAndDistance( data.speed??0, 0, m,t, {bikeType} )

        const { speed: calcSpeed, distance } = this.calculateSpeedAndDistance(power, slope, m, t, { bikeType });


        const prevTime = this.data.time??0
        const prevDistance =this.data.distanceInternal??0



        const updated = {
            ...data,
            time: prevTime+t,
            isPedalling: data.isPedalling??(v>0||pedalRpm>0),
            slope,
            power,
            speed:calcSpeed,
            distanceInternal:prevDistance+distance           
        }

        if(log && this.logger)
            this.logEvent( {message:"updateData result",mode:this.getName(),data:updated,bikeData:data} );


        this.data = updated        
        this.prevUpdateTS = Date.now()

        return updated
        
    }

    sendBikeUpdate(request: UpdateRequest): UpdateRequest  {
        if (request.slope !== undefined ) {
            this.data.slope = request.slope;
        }
        return {}        
    }

    protected  calculatePowerAndDistance(speed: number, slope: number, m: number, t: number, props= {}) { 
        const prevData = this.getData()

        const vPrev = (prevData.speed || 0 )/3.6
        const EkinPrev = 1/2*m*vPrev*vPrev;
        const vTarget = (speed||0) /3.6;
        const Ekin = 1/2*m*vTarget*vTarget;

        const powerDelta = t!==0 ? (EkinPrev - Ekin)/t : 0;
        const powerToMaintainSpeed = calc.calculatePower(m,vPrev,slope,props);
        const power = powerToMaintainSpeed - powerDelta;
        
        const v = speed/3.6
        const distance = v*t;

        this.data.power = power;
        return {power,distance}

    }

    protected  calculateSpeedAndDistance(power: number, slope: number, m: number, t: number, props= {}) { 
        const prevData = this.getData()

        const vPrev = (prevData.speed || 0 )/3.6
        const EkinPrev = 1/2*m*vPrev*vPrev;


        let powerToMaintainSpeed = calc.calculatePower(m,vPrev,slope,props);

        //no update for more than 30s - we need to reset
        if (t>=30) {
            const speed = calc.calculateSpeed(m,power,slope,props)            
            return { speed,distance:0}
        }

        const powerDelta = powerToMaintainSpeed - power;
        const Ekin = EkinPrev-powerDelta*t;

        if (Ekin>0) {
            const v = Math.sqrt(2*Ekin/m);
            const speed = v*3.6;
            const distance = v*t;

            this.data.speed = speed;
            return {speed,distance}
        }
        else {
            // Power is not sufficiant to keep moving
            const v = vPrev *0.5;
            const speed = v*3.6;
            const distance = v*t;
            this.data.speed = speed;
            return {speed,distance}

        }
    }    
    

}
