import ERGCyclingMode from '../../modes/daum-erg';
import {intVal} from '../../utils/utils'

import { IncyclistCapability,IncyclistAdapterData,ControllerConfig, IAdapter,DeviceProperties,IncyclistBikeData  } from '../../types';
import { SerialDeviceSettings } from "../types";
import { DaumSerialComms}  from './types';
import { SerialIncyclistDevice } from '../base/adapter';
import SerialInterface from '../base/serial-interface';

import SmartTrainerCyclingMode from '../../modes/daum-smarttrainer';
import DaumPowerMeterCyclingMode from '../../modes/daum-power';
import EventEmitter from 'events';

export default class DaumAdapter<S extends SerialDeviceSettings, P extends DeviceProperties, C extends DaumSerialComms> extends SerialIncyclistDevice<P>  {

    protected static controllers: ControllerConfig = {
        modes: [ERGCyclingMode,SmartTrainerCyclingMode,DaumPowerMeterCyclingMode],
        default:ERGCyclingMode
    }
    comms:C;

    distanceInternal: number;

    deviceData: IncyclistBikeData;
    requests: Array<any> = []
    iv: { 
        sync: NodeJS.Timeout,
        update: NodeJS.Timeout,
        emitter: EventEmitter
        stopRequested?: boolean
    };

    tsPrevData: number;
    adapterTime: number=0;

    requestBusy: boolean = false;
    updateBusy: boolean = false;

    startPromise: Promise<boolean>
    checkPromise: Promise<boolean>

    constructor( settings:S,props?: P) {
        super(settings,props);

        this.iv         = undefined;

        this.deviceData = {
            isPedalling:false,
            time:0,
            power:0,
            pedalRpm:0,
            speed:0,
            distanceInternal:0,
            heartrate:0
        }

        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, IncyclistCapability.HeartRate, 
            IncyclistCapability.Control
        ]
       
    }

    getPort() {
        return this.comms?.getPort();
    }

    getSerialInterface():SerialInterface {
        return this.comms?.serial
    }


    
    async sendInitCommands():Promise<boolean> {

        if (this.started && !this.stopped) {
            try {
                if (this.getCyclingMode() instanceof ERGCyclingMode) {
                
                    const power = this.data.power
                    const request = power ? {targetPower:power} : this.getCyclingMode().getBikeInitRequest()
                    await this.sendUpdate(request)
                    return true
                }
            }
            catch {
                return false
            }
        }
        return false
        
    }



    /* istanbul ignore next */
    getCurrentBikeData(): Promise<IncyclistBikeData> {
        throw new Error('Method not implemented.');
    }

    getComms():C {
        return this.comms;
    }

    isEqual(settings: SerialDeviceSettings): boolean {
        const as = this.settings as SerialDeviceSettings
        if (settings.interface!==this.getInterface())
            return false
        if (settings.protocol!==as.protocol || settings.port!==as.port)
            return false;        
        return true;
    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof DaumAdapter))
            return false;
        const adapter = device as DaumAdapter<S,P,C>;
        return  (adapter.getName()===this.getName() && adapter.getPort()===this.getPort())
    }

    isStopped() {
        return this.stopped;
    }

    initData() {
        this.distanceInternal = undefined;
        this.paused = false;
        this.stopped = false;
        this.deviceData = {
            isPedalling:false,
            time:0,
            power:0,
            pedalRpm:0,
            speed:0,
            distanceInternal:0,
            heartrate:0
        }
        this.data = {}

        this.requests   = [];
        
        // create a fresh instance of the CycingMode processor
        const name = this.getCyclingMode().getName();
        const settings = this.getCyclingMode().getSettings();
        this.setCyclingMode(name,settings);
        
    }

    async pause(): Promise<boolean> {
        await this.stopUpdatePull()
        const paused  = await super.pause()        
        this.comms?.pause()
        return paused
    }


    async resume(startUpdatePull=true): Promise<boolean> {
        const resumed = await super.resume()
        this.comms?.resume()
        if (startUpdatePull)
            await this.startUpdatePull()
        return resumed
    }

    async waitForPrevCheckFinished():Promise<void> {
        if (this.checkPromise) {
            this.logEvent( {message:"waiting for previous check device",port:this.getPort()});
            try {
                await this.checkPromise
            } catch{}
            this.logEvent( {message:"previous check device completed",port:this.getPort()});
            this.checkPromise = undefined
        }
    }

    async check():Promise<boolean> {

        await this.waitForPrevCheckFinished()
        await this.waitForPrevStartFinished()

        // don't perform device checks if device was stopped
        if (this.isStopped())
            return false;

        this.checkPromise = this.performCheck()
        try {
            const res = await this.checkPromise
            this.checkPromise = undefined
            return res
        }
        catch(err) {
            this.checkPromise = undefined
            throw err;
        }
    }

    /* istanbul ignore next */
    async performCheck():Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    async waitForPrevStartFinished() {
        if (this.startPromise) {
            this.logEvent( {message:"waiting for previous device launch",port:this.getPort()});
            try {
                await this.startPromise
            } catch{}
            this.logEvent( {message:"previous device launch attempt completed",port:this.getPort()});
            this.startPromise = undefined
        }
    }

    async start(props?:P):Promise<boolean> {

        await this.waitForPrevCheckFinished()
        await this.waitForPrevStartFinished()

        const isRelaunch = this.started
        const message = isRelaunch ? 'relaunch of device' :'initial start of device';
        
        this.logger?.logEvent({message});

        try {
            let wasPaused = false;
            if (isRelaunch && this.isPaused()){
                this.resume(false)
                wasPaused = true;
            }

            this.startPromise = this.performStart(props, isRelaunch, wasPaused).then( async (started):Promise<boolean>=>{
                if (!started) {
                    this.logEvent({message: 'start result: not started'})
                    this.started = false
                    return false;
                }

                if (!isRelaunch) {
                    try {
                        const deviceInfo = await this.getDeviceInfo()
                        this.logEvent({message: 'device info', deviceInfo })
                    }
                    catch {}
                }
    
                this.logEvent({message: 'start result: success'})
                this.started = true;
                return true;    
            })
            const started = await this.startPromise
        
            this.startPromise = undefined
            return started;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message})

            this.startPromise = undefined
            this.started = false;
            throw new Error(`could not start device, reason:${err.message}`)
        }

    }



    /* istanbul ignore next */
    performStart( props?: P,isRelaunch=false,wasPaused=false ): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    startUpdatePull():void{

        // ignore if already  started
        if (this.iv)
            return;

        this.logEvent({message:'start update pull', port:this.getPort()})
        const ivSync = setInterval( ()=>{
            try {
                this.bikeSync();                
            }
            catch{}
        } ,this.pullFrequency)

        const ivUpdate = setInterval( ()=>{
            try {
                this.emitData(this.data);
                this.refreshRequests()
            }
            catch {}
        } ,this.pullFrequency)

        this.iv = {
            sync: ivSync,
            update: ivUpdate,
            emitter: new EventEmitter()            
        }
        this.iv.emitter.once('stop' ,()=>{ 
            this.iv.stopRequested=true
        })


    }

    protected cleanupInterval() {
        if (!this.iv)
            return;

        if (this.iv.sync)
            clearInterval(this.iv.sync)

        if (this.iv.sync)
            clearInterval(this.iv.update)

        if (this.iv.emitter)
            this.iv.emitter.removeAllListeners()

        this.iv = undefined
    }

    async stopUpdatePull():Promise<void> { 
        if (!this.iv || !this.iv.emitter)
            return;

        return new Promise( done => {
            
            this.iv.emitter.on('stop-done',()=>{
                this.logEvent({message:'stop update pull done', port:this.getPort()})
                this.cleanupInterval()
                done()
            })
    
            this.iv.emitter.emit('stop')
            this.logEvent({message:'stop update pull', port:this.getPort()})   
        })

    }

    async connect():Promise<boolean> {
        if (!this.comms)
            return false;

        if(this.comms.isConnected())
            return true

        try {        
            const connected =  await this.comms.connect()
            return connected
        }
        catch(err) {
            await this.comms.close()
            return false;
        }

    }

    async close():Promise<boolean> {
        if (!this.comms)
            return true;

        if(!this.comms.isConnected())
            return true;
        return await this.comms.close();        
    }

    async verifyConnection():Promise<void> {        
        if(!this.comms.isConnected()) {
            const connected = await this.comms.connect();
            if(!connected)
                throw new Error('not connected')
        }    
    }

    async reconnect(): Promise<boolean> {
        try {
            await this.comms.close()
            const connected = await this.comms.connect()
            return connected
        }
        catch(err) {
            return false;
        }
    }

    logEvent( event) {
        if (!this.logger || this.paused)
            return;
        this.logger.logEvent(event);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
 
        /* istanbul ignore next */
        if (w?.DEVICE_DEBUG) {
            console.log(`~~~ ${this.logger.getName()}`,event)
        }

    }
          

    async stop(): Promise<boolean> {

        if (this.stopped)
            return true;

        this.logEvent({message:'stop request', port:this.getPort()});        
        if (this.paused)
            this.resume()

        try {
            await this.stopUpdatePull()
            await this.comms.close()
            this.logEvent({message:'stop request completed', port:this.getPort()});        
            this.stopped = true;
        }
        catch (err) {
            this.logEvent({message:'stop request failed', port:this.getPort(),reason:err.message});                        
            throw(err)
        }

        return this.stopped
    }

    
    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused || this.stopped)
            return;
        
        this.logEvent({message:'sendUpdate', port:this.getPort(),request,waiting:this.requests.length});    
        return await this.processClientRequest(request);
    } 

    async update():Promise<void> {

        // now get the latest data from the bike
        if (!this.canEmitData() || this.updateBusy) 
            return;

        this.updateBusy = true;

        try {
            const bikeData = await this.getCurrentBikeData()

            // update Data based on information received from bike
            const incyclistData = this.updateData(bikeData)

            // transform  ( rounding / remove ignored values)
            const data = this.transformData(incyclistData);

            this.updateBusy = false;
            this.emitData(data)

        }
        catch(err) {
            try{
                this.logEvent({message:'bike update error', port:this.getPort(),error:err.message,stack:err.stack })

                // use previous values
                const incyclistData =this.updateData( this.deviceData)
                this.transformData(incyclistData);
            }
            catch{}

            this.updateBusy = false;
        }

    }

    async sendRequests() {
        if (this.stopped || this.paused)
            return;
        if (this.requestBusy)
            return;

        // if we have updates, send them to the device
        if (this.requests.length>0) {

            // ignore previous requests, only send last one
            const cnt = this.requests.length;
            if (cnt>1) {
                this.requests.forEach( (request,idx) => {
                    if (idx!==cnt-1) {
                        this.logEvent({message:'ignoring bike update request', port:this.getPort(),request})
                    }
                })
                this.requests = [this.requests[cnt-1]]
            }
            let request = this.requests[0]

            // at this point we should have only one request remaining

            try {
                await this.sendRequest(request);                                   
                this.requests.shift();

            }
            catch (err) {
                this.logEvent({message:'bike update error', port:this.getPort(),error:err.message,stack:err.stack,request})
            }
            
        }    

    }

    async bikeSync() {
        if (!this.iv?.stopRequested)
            await this.sendRequests();
        if (!this.iv?.stopRequested)
            await this.update()
        
        if (this.iv?.stopRequested) {
            this.iv.emitter.emit('stop-done', 'bikeSync')
        }
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

        this.deviceData = this.getCyclingMode().updateData(data);

        return this.deviceData;        
    }


    transformData(cyclingData:IncyclistBikeData ): IncyclistAdapterData {
   
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
        } as IncyclistAdapterData;


        this.data = data;
        return data
    }

    async sendRequest(request) {
        this.requestBusy = true;
        try {
            this.logEvent({message:'sendRequest',request})
            const bike = this.getComms();
            const isReset = ( !request || request.reset || Object.keys(request).length===0 );

            if (isReset) {
                this.requestBusy = false;
                return {};
            }
               
            if (request.slope!==undefined) {
                await bike.setTargetSlope(request.slope);
            }
            if (request.targetPower!==undefined ) {
                await bike.setTargetPower(request.targetPower);
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
        if (!this.deviceData.isPedalling || this.deviceData.pedalRpm===0) 
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
            this.deviceData.slope = request.slope;
        }
        
        return new Promise ( async (resolve) => {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request)
            this.logEvent({message:'add request',request:bikeRequest})
            this.requests.push(bikeRequest);
            resolve(bikeRequest);
        })
    }

     /* istanbul ignore next */
   async getDeviceInfo():Promise<any> {
        throw new Error('Method not implemented.');
    }
}