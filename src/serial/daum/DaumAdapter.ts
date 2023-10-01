import { EventLogger } from 'gd-eventlog';
import CyclingMode, { IncyclistBikeData } from '../../modes/cycling-mode';
import {Bike} from '../../types/adapter'
import ERGCyclingMode from './ERGCyclingMode';
import SmartTrainerCyclingMode from './SmartTrainerCyclingMode';
import PowerMeterCyclingMode from './DaumPowerMeterCyclingMode';
import {intVal} from '../../utils/utils'
import { DeviceProperties } from '../../types/device';
import { SerialDeviceSettings, SerialIncyclistDevice } from '../adapter';
import { IncyclistCapability } from '../../types/capabilities';
import { DeviceData } from '../../types/data';


export interface IDaumAdapter  {
    getCurrentBikeData(): Promise<IncyclistBikeData>;
}

export abstract class AbstractDaumAdapter extends SerialIncyclistDevice implements IDaumAdapter {
    abstract getCurrentBikeData(): Promise<any>
  
}

export default class DaumAdapter<S extends SerialDeviceSettings, P extends DeviceProperties> extends AbstractDaumAdapter implements Bike {

    bike;
    ignoreHrm: boolean;
    ignoreBike: boolean;
    ignorePower: boolean;

    distanceInternal: number;
    paused: boolean;
    stopped: boolean;
    cyclingData: IncyclistBikeData;
    deviceData: DeviceData;
    currentRequest;
    requests: Array<any> = []
    iv;
    logger: EventLogger;

    tsPrevData: number;
    adapterTime: number=0;

    requestBusy: boolean = false;
    updateBusy: boolean = false;


    constructor( settings:S,props?: P) {
        super(settings,props);

        this.stopped = false;
        this.paused = false;

        this.cyclingData = {
            isPedalling:false,
            time:0,
            power:0,
            pedalRpm:0,
            speed:0,
            distanceInternal:0,
            heartrate:0
        }
        this.deviceData = {}

        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, IncyclistCapability.Gear,IncyclistCapability.HeartRate, 
            IncyclistCapability.Control
        ]
        
    }
    

    setCyclingMode(mode: CyclingMode|string, settings?:any) { 
        let selectedMode :CyclingMode = this.cyclingMode;

        if ( typeof mode === 'string') {

            if ( !this.cyclingMode || this.cyclingMode.getName()!==mode) {
                const supported = this.getSupportedCyclingModes();
                const CyclingModeClass = supported.find( M => { const m = new M(this); return m.getName() === mode })
                if (CyclingModeClass) {
                    this.cyclingMode = new CyclingModeClass(this,settings);    
                    return;
                }
                selectedMode = this.getDefaultCyclingMode();
    
            }
            

        }
        else {
            selectedMode = mode;
        }
        this.cyclingMode = selectedMode;        
        this.cyclingMode.setSettings(settings);
    }
    
    async sendInitCommands():Promise<boolean> {

        if (this.started && !this.stopped) {
            try {
                if (this.getCyclingMode() instanceof ERGCyclingMode) {
                
                    const power = this.deviceData.power
                    const request = power ? {targetPower:power} : this.getCyclingMode().getBikeInitRequest()
                    await this.sendUpdate(request)
                    return true
                }
            }
            catch {
                return false
            }
        }
        else {
            return false
        }
        
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


    
    getCurrentBikeData(): Promise<IncyclistBikeData> {
        throw new Error('Method not implemented.');
    }

    getBike() {
        return this.bike;
    }

    isEqual(settings: SerialDeviceSettings): boolean {
        const as = this.settings as SerialDeviceSettings
        if (settings.interface!==this.getInterface())
            return false
        if (settings.protocol!==as.protocol || settings.port!==as.port)
            return false;        
        return true;
    }

    isSame(device:SerialIncyclistDevice):boolean {
        if (!(device instanceof DaumAdapter))
            return false;
        const adapter = device as DaumAdapter<S,P>;
        return  (adapter.getName()===this.getName() && adapter.getPort()===this.getPort())
    }

    isStopped() {
        return this.stopped;
    }

    initData() {
        this.distanceInternal = undefined;
        this.paused = false;
        this.stopped = false;
        this.cyclingData = {
            isPedalling:false,
            time:0,
            power:0,
            pedalRpm:0,
            speed:0,
            distanceInternal:0,
            heartrate:0
        }
        this.deviceData = {}

        this.currentRequest = {}
        this.requests   = [];
        
        // create a fresh instance of the CycingMode processor
        const name = this.getCyclingMode().getName();
        const settings = this.getCyclingMode().getSettings();
        this.setCyclingMode(name,settings);
        
    }

    async pause(): Promise<boolean> {
        const paused  = await super.pause()
        this.bike.pauseLogging()
        return paused
    }


    async resume(): Promise<boolean> {
        const resumed = await super.resume()
        this.bike.resumeLogging()
        return resumed
    }


    start( props?: P ): Promise<any> {
        throw new Error('Method not implemented.');
    }

    stopUpdatePull() { 
        if (!this.iv)
            return;
        
        if (this.iv.sync) clearInterval(this.iv.sync)
        if (this.iv.update) clearInterval(this.iv.update)
        this.iv = undefined
    }

    startUpdatePull() {

        this.logEvent({message:'start update pull', iv:this.iv, ignoreBike:this.ignoreBike,ignoreHrm: this.ignoreHrm, ignorePower:this.ignorePower })

        // ignore if already  started
        if (this.iv)
            return;

        // not neccessary of all device types should be ignored
        if ( this.ignoreBike && this.ignoreHrm && this.ignorePower)
            return;

        const ivSync = setInterval( ()=>{
            this.bikeSync();
            

        } ,this.pullFrequency)

        const ivUpdate = setInterval( ()=>{
            this.emitData(this.deviceData);
            this.refreshRequests()
        } ,this.pullFrequency)

        this.iv = {
            sync: ivSync,
            update: ivUpdate
        }


    }

    async connect():Promise<boolean> {
        
        if(this.bike.isConnected())
            return true

        try {
        
            const connected =  await this.bike.connect()
            return connected
        }
        catch(err) {
            await this.bike.close()
            return false;
        }

    }

    async close():Promise<boolean> {
        if(!this.bike.isConnected())
            return true;
        return await this.bike.close();        
    }

    logEvent( event) {
        if (!this.logger)
            return;
        this.logger.logEvent(event);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
 
        if (w?.DEVICE_DEBUG) {
            console.log(`~~~ ${this.logger.getName()}`,event)
        }

    }

    async reconnect(): Promise<boolean> {
        try {
            await this.bike.close()
            const connected = await this.bike.connect()
            return connected
        }
        catch(err) {
            return false;
        }
    }
          

    stop(): Promise<boolean> {

        if (this.stopped)
            return Promise.resolve(true);

        this.logEvent({message:'stop request'});        

        if (this.paused)
            this.resume()

        this.stopped = true;
        return new Promise( async (resolve,reject) => {
            try {
                if ( this.iv ) {
                    if ( this.iv.sync) clearInterval(this.iv.sync);
                    if ( this.iv.update) clearInterval(this.iv.update);
                    this.iv=undefined
                }
                // Daum Classic has a worker intervall, which needs to be stopped
                if (this.bike.stopWorker && typeof this.bike.stopWorker === 'function')
                    this.bike.stopWorker();

                await this.bike.close()
                this.logEvent({message:'stop request completed'});        
                resolve(true);
            }
            catch (err) {
                this.logEvent({message:'stop error',error:err.message});                        
                reject(err);
            }
        })
    }

    canSendUpdate(): boolean {
        if (this.paused || this.stopped)
            return false
        return super.canSendUpdate()
    }
    
    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused || this.stopped)
            return;
        
        this.logEvent({message:'sendUpdate',request,waiting:this.requests.length});    
        return await this.processClientRequest(request);
    } 

    async update() {

        // now get the latest data from the bike
        if (this.stopped)
            return;

        this.updateBusy = true;
        this.getCurrentBikeData()
        .then( bikeData => {
           
            // update Data based on information received from bike
            const incyclistData = this.updateData(bikeData)

            // transform  ( rounding / remove ignored values)
            const data = this.transformData(incyclistData);

            this.updateBusy = false;
            this.emitData(data)
        })
        .catch(err => {
            this.logEvent({message:'bike update error',error:err.message,stack:err.stack })

            // use previous values
            const incyclistData =this.updateData( this.cyclingData)
            this.transformData(incyclistData);

            this.updateBusy = false;
        })

    }

    async sendRequests() {
        if (this.stopped || this.paused)
            return;

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
        if( this.paused || this.stopped) {
            return;
        }

        // don't updat if device is still busy with previous cycle
        if (this.updateBusy || this.requestBusy) {
            return;
        }

        this.logEvent({message:'bikeSync', ignoreBike:this.ignoreBike});

        // send bike commands unless we should "ignore" bike mode
        if ( !this.ignoreBike) {
            await this.sendRequests();
        }

        await this.update()

        

    }

    updateData(bikeData:IncyclistBikeData): IncyclistBikeData {       
        let data = {} as any;

        data.isPedalling = bikeData.pedalRpm>0;
        data.power  = bikeData.power
        data.pedalRpm = bikeData.pedalRpm
        data.speed = bikeData.speed;
        data.heartrate = bikeData.heartrate
        data.distanceInternal = bikeData.distanceInternal;
        if (bikeData.gear) data.gear = bikeData.gear;
        if (bikeData.time) data.time = bikeData.time;
        if (bikeData.slope) data.slope = bikeData.slope;

        this.cyclingData = this.getCyclingMode().updateData(data);

        return this.cyclingData;        
    }


    transformData(cyclingData:IncyclistBikeData ): DeviceData {
   
        let distance=0;
        if ( this.distanceInternal!==undefined && cyclingData.distanceInternal!==undefined ) {
            distance = cyclingData.distanceInternal-this.distanceInternal
        }
        if (cyclingData.distanceInternal!==undefined)
            this.distanceInternal = cyclingData.distanceInternal;
        

        let data =  {
            speed: cyclingData.speed||0,
            slope: cyclingData.slope,
            power: intVal(cyclingData.power||0),
            cadence: intVal(cyclingData.pedalRpm),
            heartrate: intVal(cyclingData.heartrate),
            distance,
            timestamp: Date.now(),
            deviceTime: cyclingData.time,
            deviceDistanceCounter: cyclingData.distanceInternal
        } as DeviceData;

        if (this.ignoreHrm) delete data.heartrate;
        if (this.ignorePower) { 
            delete data.power;
            delete data.cadence;
        }
        if (this.ignoreBike) {
            data = { heartrate: data.heartrate};
        }

        this.deviceData = data;
        return data
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
            this.logEvent( {message:'sendRequest error',error:err.message||err})            
            return;
        }


    }

    refreshRequests() {

        if (this.isPaused() || this.isStopped())
            return;

        // not pedaling => no need to generate a new request
        if (!this.cyclingData.isPedalling || this.cyclingData.pedalRpm===0) 
            return;

        let bikeRequest = this.getCyclingMode().sendBikeUpdate({refresh:true}) || {}
        const prev = this.requests[this.requests.length-1] || {};

        if (bikeRequest.targetPower!==undefined && bikeRequest.targetPower!==prev.targetPower) {
            this.logEvent({message:'add request',request:bikeRequest})
            this.requests.push(bikeRequest);
        }
    }


    processClientRequest(request) {
        if ( request.slope!==undefined) {
            this.cyclingData.slope = request.slope;
        }
        
        return new Promise ( async (resolve) => {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request)
            this.logEvent({message:'add request',request:bikeRequest})
            this.requests.push(bikeRequest);
            resolve(bikeRequest);
        })
    }

    check(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

}