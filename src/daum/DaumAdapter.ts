import { EventLogger } from 'gd-eventlog';
import CyclingMode, { IncyclistBikeData } from '../CyclingMode';
import DeviceAdapterBase,{Bike, DeviceAdapter} from '../Device'
import ERGCyclingMode from './ERGCyclingMode';
import SmartTrainerCyclingMode from './SmartTrainerCyclingMode';
import PowerMeterCyclingMode from './PowerMeterCyclingMode';
import {floatVal,intVal} from '../utils'
import { User } from '../types/user';

const DEFAULT_BIKE_WEIGHT = 10;
const DEFAULT_USER_WEIGHT = 75;



interface DaumAdapter  {
    getCurrentBikeData(): Promise<any>;
}

export default class DaumAdapterBase extends DeviceAdapterBase implements DeviceAdapter,DaumAdapter,Bike  {

    bike;
    ignoreHrm: boolean;
    ignoreBike: boolean;
    ignorePower: boolean;

    distanceInternal: number;
    paused: boolean;
    stopped: boolean;
    data;
    currentRequest;
    requests: Array<any> = []
    iv;
    logger: EventLogger;
    cyclingMode: CyclingMode;
    userSettings: User;
    bikeSettings: any;

    tsPrevData: number;
    adapterTime: number=0;

    requestBusy: boolean = false;
    updateBusy: boolean = false;


    constructor( props, bike) {
        super(props);

        this.bike = bike;
        this.stopped = false;
        this.paused = false;
        this.data = {}

        const options = props || {};
        this.cyclingMode = options.cyclingMode;        
        this.setUserSettings(options.userSettings)
        this.setBikeSettings(options.bikeSettings);

    }

    setCyclingMode(mode: CyclingMode|string, settings?:any) { 
        let selectedMode :CyclingMode;

        if ( typeof mode === 'string') {
            const supported = this.getSupportedCyclingModes();
            const CyclingModeClass = supported.find( M => { const m = new M(this); return m.getName() === mode })
            if (CyclingModeClass) {
                this.cyclingMode = new CyclingModeClass(this,settings);    
                return;
            }
            selectedMode = this.getDefaultCyclingMode();
        }
        else {
            selectedMode = mode;
        }
        this.cyclingMode = selectedMode;        
        this.cyclingMode.setSettings(settings);
    }


    getSupportedCyclingModes() : Array<any> {         
        return [ERGCyclingMode,SmartTrainerCyclingMode,PowerMeterCyclingMode]
    }


    getCyclingMode():CyclingMode {
        if (!this.cyclingMode)
            this.setCyclingMode( this.getDefaultCyclingMode());
        return this.cyclingMode;
    }

    getDefaultCyclingMode():CyclingMode {
        return new ERGCyclingMode(this)        
    }


    setUserSettings(userSettings: User):void {
        this.userSettings = userSettings || {}
        if (this.bike) {
            if (!this.bike.settings) this.bike.settings = { user:{}}
            if (!this.bike.settings.user) this.bike.settings.user = {}
            this.bike.settings.user.weight = this.userSettings.weight || DEFAULT_USER_WEIGHT;
        }

    } 
    setBikeSettings(bikeSettings):void {
        this.bikeSettings = bikeSettings|| {}
        if (this.bike) {
            if (!this.bike.settings) this.bike.settings = {}
            this.bike.settings.weight = this.userSettings.weight || DEFAULT_BIKE_WEIGHT;
        }
    } 

    getWeight():number {
        const userWeight = this.userSettings.weight || DEFAULT_USER_WEIGHT;
        const bikeWeight = this.bikeSettings.weight ||  DEFAULT_BIKE_WEIGHT;
        return bikeWeight+userWeight;
    }

    
    getCurrentBikeData(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    getBike() {
        return this.bike;
    }

    isBike() {
        return true;
    }

    isPower() {
        return true;
    }

    isHrm() {
        return true;
    }

    setIgnoreHrm(ignore) {
        this.ignoreHrm=ignore;
    }

    setIgnoreBike(ignore) {
        this.ignoreBike=ignore;
    }

    isStopped() {
        return this.stopped;
    }

    initData() {
        this.distanceInternal = undefined;
        this.paused = false;
        this.stopped = false;
        this.data       = {
            time:0,
            slope:0,
            distance:0,
            speed:0,
            isPedalling:false,
            power:0,
            distanceInternal:0
        }
        this.currentRequest = {}
        this.requests   = [];
        
        // create a fresh instance of the CycingMode processor
        const name = this.getCyclingMode().getName();
        const settings = this.getCyclingMode().getSettings();
        this.setCyclingMode(name,settings);
        
    }

    start( props?: any ): Promise<any> {
        throw new Error('Method not implemented.');
    }

    startUpdatePull() {
        // ignore if already  started
        if (this.iv)
            return;

        // not neccessary of all device types should be ignored
        if ( this.ignoreBike && this.ignoreHrm && this.ignorePower)
            return;

        this.iv = setInterval( ()=>{
            this.bikeSync();
            

        } ,1000)

        this.iv = setInterval( ()=>{
            this.sendData();
            this.refreshRequests()
        } ,1000)


    }

    connect() {
        if(!this.bike.isConnected())
            this.bike.connect()
    }

    close() {
        return this.bike.saveClose();        
    }

    logEvent( event) {
        if (!this.logger)
            return;
        this.logger.logEvent(event);
    }

          

    stop(): Promise<boolean> {
        this.logEvent({message:'stop request'});        
        this.stopped = true;
        return new Promise( (resolve,reject) => {
            try {
                if ( this.iv) {
                    clearInterval(this.iv);
                    this.iv=undefined
                }
                this.logEvent({message:'stop request completed'});        
                this.paused=undefined;
                resolve(true);
            }
            catch (err) {
                this.logEvent({message:'stop error',error:err.message});        
                reject(err);
            }
        })
    }

    pause(): Promise<boolean> {
        this.logEvent({message:'pause'});    
        return new Promise ( resolve => {
            this.paused = true;
            resolve(true)
        })
    }


    resume(): Promise<boolean> {
        this.logEvent({message:'resume'});    
        return new Promise ( resolve => {
            this.paused = false;
            resolve(true)
        })

    }

    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused)
            return;
        
        this.logEvent({message:'sendUpdate',request,waiting:this.requests.length});    
        return await this.processClientRequest(request);
    } 

    sendData() {
        if ( this.onDataFn) 
            this.onDataFn(this.data)
    }

    async update() {
        // now get the latest data from the bike
        this.updateBusy = true;
        this.getCurrentBikeData()
        .then( bikeData => {
            
            // update Data based on information received from bike
            this.updateData(this.data, bikeData)

            // transform  ( rounding / remove ignored values)
            this.transformData();

            this.updateBusy = false;
        })
        .catch(err => {
            this.logEvent({message:'bike update error',error:err.message,stack:err.stack })
            this.updateBusy = false;
        })

    }

    async sendRequests() {
        // if we have updates, send them to the device
        if (this.requests.length>0) {
            const processing  =[...this.requests];

            // ignore previous requests, only send last one
            const cnt = processing.length;
            processing.forEach( async (request,idx) => {
                if (cnt>1 && idx<cnt-1) {
                    this.logEvent({message:'ignoring bike update request',request})
                    this.requests.shift();
                    return;
                }
            })

            // at this point we should have only one request remaining
            const request = processing[0]

            try {
                await this.sendRequest(request);                                   
                this.requests.shift();

            }
            catch (err) {
                this.logEvent({message:'bike update error',error:err.message,stack:err.stack,request})
            }
            
        }    

    }

    async bikeSync() {

        // don't send any commands if we are pausing
        if( this.paused) {
            return;
        }

        // don't updat if device is still busy with previous cycle
        if (this.updateBusy || this.requestBusy) {
            return;
        }

        this.logEvent({message:'bikeSync'});

        // send bike commands unless we should "ignore" bike mode
        if ( !this.ignoreBike) {
            await this.sendRequests();
        }

        await this.update()

        

    }

    updateData( prev,bikeData) {
        //this.logEvent({message:'updateData',data,bikeData})
    
        
        let data = {} as any;
        data.isPedalling = bikeData.cadence>0;
        data.power  = bikeData.power
        data.pedalRpm = bikeData.cadence
        data.speed = bikeData.speed
        data.heartrate = bikeData.heartrate
        data.distance = bikeData.distance/100
        data.distanceInternal = bikeData.distance;
        data.gear = bikeData.gear

        if (this.tsPrevData && data.isPedalling) {
            this.adapterTime = Date.now() - this.tsPrevData;
        }
        this.tsPrevData = Date.now();

        data.time = Math.round(this.adapterTime||0);
        if (bikeData.slope) data.slope = bikeData.slope;


        this.data = this.getCyclingMode().updateData(data);
        
    }


    transformData( ) {

        if ( this.data===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && this.data.distanceInternal!==undefined ) {
            distance = intVal(this.data.distanceInternal-this.distanceInternal)
        }
        if (this.data.distanceInternal!==undefined)
            this.distanceInternal = this.data.distanceInternal;
        

        let data =  {
            speed: floatVal(this.data.speed),
            slope: floatVal(this.data.slope),
            power: intVal(this.data.power),
            cadence: intVal(this.data.pedalRpm),
            heartrate: intVal(this.data.heartrate),
            distance,
            timestamp: Date.now()
        } as any;

        if (this.ignoreHrm) delete data.heartrate;
        if (this.ignorePower) { 
            delete data.power;
            delete data.cadence;
        }
        if (this.ignoreBike) {
            data = { heartrate: data.heartrate};
        }

        this.data = data;
    }

    async sendRequest(request) {
        this.requestBusy = true;
        try {
            this.logEvent({message:'sendRequest',request})
            const bike = this.getBike();
            const isReset = ( !request || request.reset || Object.keys(request).length===0 );

            if (isReset) {
                this.requestBusy = false;
                return {};
            }
               
            if (request.slope!==undefined) {
                await bike.setSlope(request.slope);
            }
            if (request.targetPower!==undefined ) {
                await bike.setPower(request.targetPower);
            }
            this.requestBusy = false;
            return request
        
        }
        catch (err) {
            this.requestBusy = false;
            this.logEvent( {message:'error',fn:'sendRequest()',error:err.message||err})            
            return;
        }


    }

    refreshRequests() {
        // not pedaling => no need to generate a new request
        if (!this.data.isPedalling || this.data.pedalRpm===0) 
            return;

        let bikeRequest = this.getCyclingMode().sendBikeUpdate({refresh:true})

        const prev = this.requests[this.requests.length-1];
        if (bikeRequest.targetPower!==undefined && bikeRequest.targetPower!==prev.targetPower) {
            this.logEvent({message:'add request',request:bikeRequest})
            this.requests.push(bikeRequest);
        }
    }


    processClientRequest(request) {
        if ( request.slope!==undefined) {
            this.data.slope = request.slope;
        }
        
        return new Promise ( async (resolve) => {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request)
            this.logEvent({message:'add request',request:bikeRequest})
            this.requests.push(bikeRequest);
            resolve(bikeRequest);
        })
    }


}