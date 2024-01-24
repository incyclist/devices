import { CyclingModeConfig, Settings, UpdateRequest } from './types';
import { IncyclistBikeData,IAdapter } from "../types";

import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../base/consts";
import calc from '../utils/calculations'
import { EventLogger } from 'gd-eventlog';
import { CyclingModeBase } from './base';
import { IncyclistDeviceAdapter } from '../base/adpater';

const MIN_SPEED = 10;

export default  class PowerBasedCyclingModeBase extends CyclingModeBase  {

    data: IncyclistBikeData;
    prevUpdateTS: number = 0;
    logger: EventLogger;
    prevRequest: UpdateRequest|undefined;
    protected static config:CyclingModeConfig={name:'',description:'',properties:[]}

    constructor(adapter: IAdapter,   props?: Settings) {
        super(adapter,props);
        this.data = { speed: 0 , power:0,  distanceInternal:0, pedalRpm:0, isPedalling:false, heartrate:0}
    }


    getData():IncyclistBikeData {
        return this.data
    }

    getSlope():number {
        const {slope} = this.data
        return slope||0;
    }

    initLogger(defaultLogName) {
        /*
        const a = this.adapter as IncyclistDeviceAdapter
        this.logger =  a.getLogger() 
        if (!this.logger) 
        */
        this.logger = new EventLogger(defaultLogName)
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


    checkForResetOrEmpty(request: UpdateRequest):UpdateRequest|undefined {
        if ( !request || request.reset  ) {
            this.prevRequest = {};
            return {reset:true} 
        }

        if ( Object.keys(request).length===0 && this.prevRequest) {           
            return {targetPower:this.prevRequest.targetPower, refresh:true}
        }

    }

    protected checkForTempPowerAdjustments(request: UpdateRequest) {
        if (request.targetPowerDelta && this.prevRequest && this.prevRequest.targetPower) {
            request.targetPower = this.prevRequest.targetPower + request.targetPowerDelta;
            if (request.targetPower < 10)
                request.targetPower = this.prevRequest.targetPower;
            delete request.targetPowerDelta;
        }
    }

    protected checkRefresh(request: UpdateRequest, newRequest: UpdateRequest) {
        if (request.refresh && request.targetPower === undefined) {
            delete request.refresh;
            if (this.prevRequest)
                newRequest.targetPower = this.prevRequest.targetPower;
            
        }
    }

    protected checkTargetPowerSet(request: UpdateRequest, newRequest: UpdateRequest) {
        let target=undefined

        if (request.targetPower!==undefined)
            target=request.targetPower

        if (request.targetPower === undefined && request.maxPower !== undefined && request.minPower !== undefined && request.maxPower === request.minPower) {
            target = request.minPower
        }

        if (target !== undefined) {
            delete request.refresh;
            newRequest.targetPower = Number(target);
        }
    }

    protected checkSlope(request: UpdateRequest) {
        if (request.slope !== undefined) {
            this.data.slope = request.slope;
            delete request.slope;
        }
    }

    protected checkEmptyRequest(newRequest: UpdateRequest) {
        if (Object.keys(newRequest).length === 0) {
            if (this.prevRequest) {
                newRequest.targetPower = this.prevRequest.targetPower;
                newRequest.refresh = true;
            }
        }
    }

    protected checkMinPower(request: UpdateRequest, newRequest: UpdateRequest) {
        if (request.minPower !== undefined) {
            const target = newRequest.targetPower !== undefined ? newRequest.targetPower : this.prevRequest.targetPower;
            if (target && target < request.minPower) {
                newRequest.targetPower = request.minPower;
            }
            else {                
                newRequest.targetPower = target
            }
            newRequest.minPower = request.minPower;
        }
    }

    protected checkMaxPower(request: UpdateRequest, newRequest: UpdateRequest) {
        if (request.maxPower !== undefined) {
            const target = newRequest.targetPower !== undefined ? newRequest.targetPower : this.prevRequest.targetPower;
            if (target && target > request.maxPower) {
                newRequest.targetPower = request.maxPower;
            }
            else {
                newRequest.targetPower = target
            }
            newRequest.maxPower = request.maxPower;
        }
    }


    calculateSpeedAndDistance(power: number, slope: number, m: number, t: number, props= {}) { 
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

    protected updateSpeedAndDistance(power: number, slope: any, bikeType: any, data: IncyclistBikeData, prevData: any) {
        const distanceInternal = prevData.distanceInternal || 0;  // meters
        const m = this.getWeight();
        const t = this.getTimeSinceLastUpdate();


        const { speed, distance } = this.calculateSpeedAndDistance(power, slope, m, t, { bikeType });

        if (power === 0 && speed < MIN_SPEED) {
            data.speed = prevData.speed < 1 ? 0 : prevData.speed - 1;
            data.distanceInternal = distanceInternal||0 + data.speed / 3.6 * t;
        }
        else {
            data.speed = speed;
            data.distanceInternal = distanceInternal + distance;
        }

        // avoid that ride continues with speed = 0.000001 or similar
        if (data.speed<0.1)
            data.speed = 0;
        
        return t;
    }

    protected getCalcBasics(bikeData:IncyclistBikeData) {
        const prevData = JSON.parse(JSON.stringify(this.getData()));
        const data = Object.assign({},this.getData())
        const prevRequest = this.prevRequest||{}
        const bikeType = this.getSetting('bikeType')?.toLowerCase();
        const slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
        this.copyBikeData(data,bikeData)

        return { data,prevData, prevRequest, bikeType,slope };
    }

    copyBikeData(data:IncyclistBikeData, bikeData:IncyclistBikeData):IncyclistBikeData {
        const keys = Object.keys(bikeData)
        keys.forEach( key=> {
            if (bikeData[key]===null)
                delete data[key]
            if (key==='slope') //ignore slope delivered by bike {
                return;

            else if (bikeData[key]!==undefined)
                data[key]=bikeData[key]
        })
        
        if (data.distanceInternal===undefined) data.distanceInternal=0
        if (data.time===undefined) data.time=0
        if (data.slope===undefined) data.slope=0
        if (bikeData.isPedalling===undefined) data.isPedalling=data.pedalRpm>0

        // slope will be copied from prev. request
        if (this.prevRequest?.slope!==undefined) {
            data.slope = this.prevRequest.slope
        }
        return data
    }

    calculatePowerAndDistance(speed: number, slope: number, m: number, t: number, props= {}) { 
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

    getBikeInitRequest(): UpdateRequest {
        return {}
    }

    sendBikeUpdate(incoming: UpdateRequest): UpdateRequest {
        if (this.logger)
            this.logger.logEvent( {message:"processing update request",request:incoming,prev:this.prevRequest,data:this.getData()} );        

        let newRequest:UpdateRequest = {}
        const request = Object.assign({},incoming)

        try {

            const req = this.checkForResetOrEmpty(request)
            if (req)
                return req

            // checks that might modify original request
            this.checkSlope(request);
            this.checkForTempPowerAdjustments(request);

            // checks that will set target request
            this.checkTargetPowerSet(request, newRequest);
            this.checkRefresh(request,newRequest);   
            this.checkMaxPower(request, newRequest);        
            this.checkMinPower(request, newRequest);            

            // if the request object is empty at this point, we just refresh the prev request
            this.checkEmptyRequest(newRequest); 
      
            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        }
        
        catch ( err)  /* istanbul ignore next */ {
            // I'm not expecting any error here, but just in case, if we catch anything we'll log
            if (this.logger)
                this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',error:err.message,stack:err.stack} );
        }
        
        return newRequest;        
    }

    updateData(bikeData: IncyclistBikeData, log:boolean=true):IncyclistBikeData {

        try {
            const { data,prevData, slope, bikeType } = this.getCalcBasics(bikeData);                 

            // calculate speed and distance
            const t = this.updateSpeedAndDistance(data.power, slope, bikeType, data, prevData);            
            data.time = (data.speed>0) ?  data.time+t : data.time

            if(log && this.logger)
                this.logger.logEvent( {message:"updateData result",mode:this.getName(),data,bikeData} );

            this.data = data;
            this.prevUpdateTS = Date.now()

            return data;
        
        }
        catch (err) /* istanbul ignore next */ {
            if (this.logger)
                this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
            return this.getData()
        }

        
    }



}
