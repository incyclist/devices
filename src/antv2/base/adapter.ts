
import { IChannel, ISensor, Profile } from 'incyclist-ant-plus'
import AntInterface from './interface';

import IncyclistDevice from '../../base/adpater';
import { AntDeviceProperties, AntDeviceSettings, isLegacyProfile, LegacyProfile,BaseDeviceData, AdapterStartStatus } from '../types';
import { IAdapter,IncyclistAdapterData,IncyclistBikeData,IncyclistCapability } from '../../types';
import { runWithTimeout, sleep } from '../../utils/utils';
import { getBrand, mapLegacyProfile } from '../utils';
import { DEFAULT_UPDATE_FREQUENCY } from '../consts';
import SensorFactory from '../factories/sensor-factory';
import { EventLogger } from 'gd-eventlog';

const INTERFACE_NAME = 'ant'
const MAX_RETRIES = 3;

export default class AntAdapter<TDeviceData extends BaseDeviceData> extends IncyclistDevice<AntDeviceProperties> {
    sensor: ISensor;
    data: IncyclistAdapterData;
    deviceData: TDeviceData;
    updateFrequency: number;
    channel: IChannel;
    ant: AntInterface
    userSettings: { weight?:number};
    bikeSettings: { weight?:number};
    onDataFn: (data: IncyclistAdapterData) => void
    
    protected ivDataTimeout: NodeJS.Timeout
    protected lastDataTS: number;
    protected dataMsgCount: number;
    protected ivWaitForData: NodeJS.Timeout
    protected promiseWaitForData: Promise<boolean>
    protected sensorConnected: boolean
    protected startStatus: AdapterStartStatus
    protected startupRetryPause: number = 1000;


    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {

        super(settings, props)

        const profile = this.getProfileName()

        // check against legacy settings (using protocol and Incyclist profile name)
        if (settings.protocol && settings.profile!==this.getLegacyProfileName())
            throw new Error('Incorrect Profile')
        // check against new settings (not using protocol and and using ANT profile name)
        if (!settings.protocol && settings.profile!==this.getProfileName())
            throw new Error('Incorrect Profile')

        const antSettings = this.settings as AntDeviceSettings

        if (isLegacyProfile(antSettings.profile))
            antSettings.profile = mapLegacyProfile(antSettings.profile as LegacyProfile)
        
        if (this.settings.interface!=='ant')
            throw new Error ('Incorrect interface')

        this.sensor = this.createSensor(settings)
        this.sensorConnected = false;      


        this.deviceData = {
            DeviceID: Number(settings.deviceID )
        } as TDeviceData;

        this.data = {} as IncyclistAdapterData
        this.dataMsgCount = 0;
        this.logger = new EventLogger(`Ant+${profile}`)

        this.updateFrequency = DEFAULT_UPDATE_FREQUENCY;
        this.channel = undefined;
        this.ant = AntInterface.getInstance();

        if (this.isDebugEnabled()) {
            this.ant.setLogger(this as unknown as EventLogger)
        }
        if (this.getStaticCapabilities() )
            this.capabilities = this.getStaticCapabilities() 
    }

    getProfileName():Profile  {
        const C = this.constructor as typeof AntAdapter<TDeviceData>     
            
        return this.sensor?.getProfile() || C['ANT_PROFILE_NAME']
    }

    getLegacyProfileName():LegacyProfile {
        const C = this.constructor as typeof AntAdapter<TDeviceData>
        return C['INCYCLIST_PROFILE_NAME']
    }

    protected getStaticCapabilities():Array<IncyclistCapability> {
        const C = this.constructor as typeof AntAdapter<TDeviceData>
        return C['CAPABILITIES']
    }


    createSensor(settings:AntDeviceSettings):ISensor {
        return SensorFactory.create( this.getProfileName(), Number(settings.deviceID)) 
    }


    isEqual(settings: AntDeviceSettings): boolean {
        const as = this.settings as AntDeviceSettings;

        if (as.interface!==settings.interface)
            return false;

        if (Number(as.deviceID)!==Number(settings.deviceID) || as.profile!==settings.profile)
            return false;

        return true;        
    }

    /* istanbul ignore next */
    getDefaultReconnectDelay(): number {
        return this.startupRetryPause
    }
    
    async connect():Promise<boolean> { 
        const connected = await AntInterface.getInstance().connect()
        return connected
    }

    /* istanbul ignore next */
    async close():Promise<boolean> { 
        return true  
    }
    
    resetData():void {
        this.dataMsgCount = 0;
        const {DeviceID} = this.deviceData;
        this.deviceData = { DeviceID } as TDeviceData
        this.data = {}
        this.lastDataTS = undefined
    }


    isSame(device:IAdapter):boolean {
        if (!(device instanceof AntAdapter))
            return false;
        const adapter = device;
        return  (adapter.getID()===this.getID() && adapter.getProfile()===this.getProfile())
    }

    hasData():boolean {
        return this.dataMsgCount>0
    }

    /* istanbul ignore next */
    mapData(deviceData:TDeviceData):IncyclistBikeData {
        throw new Error('message not implemented')        
    }

    /* istanbul ignore next */
    transformData(data:IncyclistBikeData,deviceData:TDeviceData):void {        
        throw new Error('message not implemented')        
    }

    /* istanbul ignore next */
    mapToAdapterData(deviceData):void {
        throw new Error('message not implemented')        
    }


    onDeviceData( deviceData:TDeviceData) {
        this.dataMsgCount++;
        this.lastDataTS = Date.now();

        try {
            const {ManId} = this.deviceData

            this.deviceData = Object.assign( {},deviceData);
            if (!ManId && deviceData.ManId) {
                this.emit('device-info', this.getSettings(), {manufacturer: getBrand(deviceData.ManId)})
            }

            const logData = this.getLogData(deviceData, ['PairedDevices','RawData']);
            this.logEvent( {message:'onDeviceData', data:logData, paused:this.paused,started:this.started, canEmit:this.canEmitData()})

            if ( this.isStopped() || !this.canEmitData())
                return;   
            
            if (this.isControllable()) {
                // transform data into internal structure of Cycling Modes
                let incyclistData = this.mapData(deviceData)      

                // let cycling mode process the data
                incyclistData = this.getCyclingMode().updateData(incyclistData);   

                // transform data into structure expected by the application
                this.transformData(incyclistData,deviceData);                          

            }
            else  {
                this.mapToAdapterData(deviceData)                            
            }

            this.emitData(this.data)
        }
        catch ( err) {            
            // istanbul ignore next
            this.logEvent({message:'error',fn:'onDeviceData()',error:err.message||err, stack:err.stack})
        }
    }


    isWaitingForData():boolean {
        return this.promiseWaitForData!==undefined && this.promiseWaitForData!==null
    }

    async _wait() :Promise<boolean>{
        const res = new Promise<boolean>( (resolve) => {

            const iv = setInterval( ()=> { 
                if (this.hasData()) {
                    //this.logEvent({message:'has Data',data:this.deviceData})
                    clearInterval(iv)
                    resolve(true)
                }
                if (!this.promiseWaitForData) {
                    resolve(false)
                    clearInterval(iv)
                }
            }, 10)    
        })

        return res
        
    }
    

    async waitForData(timeout:number):Promise<boolean> {
        if (this.hasData()) {
            return true;
        }

        const tsStart = Date.now()

        
        if (this.promiseWaitForData){    
            let hasData = false
            try {
                hasData =await this.promiseWaitForData                        
            }
            catch{}

            if (hasData || Date.now()>tsStart+timeout)
                return hasData
        }
        
        
        try {    
            this.promiseWaitForData = runWithTimeout(this._wait(),timeout)
            const hasData = await this.promiseWaitForData
            this.promiseWaitForData =null;
            return hasData
        }
        catch(err) {
            this.promiseWaitForData =null;
            return false
        }   

    }


    getID(): string {
        const id=this.deviceData.DeviceID || this.sensor?.getDeviceID()
        return id.toString();
    }

    getName(): string {
        if (this.settings.name)
            return this.settings.name
        const deviceID = this.getID()
        const profile  = this.getProfileName()

        return `Ant+${profile} ${deviceID}`;
    }

    getUniqueName(): string {
        if (this.settings.name)
            return this.settings.name

        const {ManId} = this.deviceData;

        const profile  = this.getProfileName();
        const brand = getBrand(ManId)
        const id = this.getID()
        if (brand)
            return `${brand} ${profile} ${id}`
        else 
            return `${this.getName()}`        
    }

    /* istanbul ignore next */
    getDisplayName(): string {
        return this.getUniqueName()
    }

    /* istanbul ignore next */
    getInterface(): string {
        return INTERFACE_NAME
    }
    

    getProfile():Profile {
        const settings = this.settings as AntDeviceSettings
        if (settings.protocol===undefined)
            return settings.profile as Profile
        else { // Legacy 
            /* istanbul ignore next */
            return mapLegacyProfile(settings.profile as LegacyProfile)
        } 
    }

    getLogData(data, excludeList) {
        
        const logData  = JSON.parse(JSON.stringify(data));
        excludeList.forEach( (key) => {
            delete logData[key] })
        return logData;
    }
    

    async check():Promise<boolean> {
        try {
            return await this.start();
        }
        catch(error) {
            return false
        }
    }

    /* istanbul ignore next */
    async checkCapabilities():Promise<void> {
        return;
    }

    /* istanbul ignore next */
    async initControl():Promise<void> {
        return;
    }

    /* istanbul ignore next */
    getDefaultStartupTimeout():number {
        return 20000
    }

    async startPreChecks(props:AntDeviceProperties):Promise< 'done' | 'connected' | 'connection-failed' > {
        const wasPaused = this.paused 
        const wasStopped = this.stopped;
       
        this.stopped = false;
        if (wasPaused)
            this.resume()

        if (this.started && !wasPaused && !wasStopped) {
            return 'done';
        }
        if (this.started && wasPaused ) { 
            return 'done';
        }
       
        const connected = await this.connect()
        if (!connected)
            return 'connection-failed'

        return 'connected'
    }

    resetStartStatus() {
        this.startStatus = {timeout:false,hasData:false,sensorStarted:false}
    }

    isStartSuccess() {
        const {timeout,hasData,sensorStarted,controlInitialized,userInitialized,interrupted} = this.startStatus;

        if(interrupted)
            return false;

        if ( this.hasCapability( IncyclistCapability.Control ) )
            return sensorStarted && hasData && userInitialized && controlInitialized && !timeout
        else 
            return sensorStarted && hasData && !timeout
    }

    reportStartStatus() {
        const success = this.isStartSuccess()

        if (success) {
            this.logEvent( {message:'start device success', device:this.getName()})
            this.started = true;
            this.paused = false;
            return true;
        }
        else {
            this.started = false;
        

            const {sensorStarted,hasData,interrupted} = this.startStatus
            if (interrupted) {
                this.logEvent( {message:'start device interrupted', device:this.getName()})
                return false;
            }

            if (!sensorStarted) { 
                this.logEvent( {message:'start device failed', device:this.getName(),reason:'could not connect'})            
                throw new Error('could not start device, reason:could not connect')
            }

            else if (!hasData) {          
                this.logEvent( {message:'start device failed', device:this.getName(),reason:'no data received'})                
                throw new Error('could not start device, reason:no data received')
            }
            else  {                    
                this.logEvent( {message:'start device failed', device:this.getName(),reason:'could not send FE commands'})                
                throw new Error('could not start device, reason:could not send FE commands')
            }

        }

    }

    protected async waitForInitialData(startupTimeout):Promise<void> {
        const {sensorStarted, hasData,timeout} = this.startStatus
        if ((sensorStarted && hasData) || !sensorStarted || timeout) 
            return;
       
        this.logEvent({ message: 'wait for sensor data', device:this.getName() });
        this.startStatus.hasData = await this.waitForData(startupTimeout)               
        if (this.startStatus.hasData)
            this.logEvent({ message: 'sensor data received', device:this.getName() });
    }


    protected async initSensor(props: any):Promise<boolean> {
        this.startStatus.sensorStarted = this.sensorConnected
        if (this.startStatus.sensorStarted || this.startStatus.sensorStarted) 
            return;

        this.logEvent({ message: 'start sensor', device:this.getName(), props });

        try {
            this.sensorConnected = await this.startSensor();

            if (this.sensorConnected) {
                this.logEvent({ message: 'sensor started', device:this.getName(), props });
                this.startStatus.sensorStarted = true;
            }
            else {
                this.logEvent({ message: 'start sensor failed', device:this.getName(), reason:'unknown', props });    
            }
    
        }
        catch (err) {
            this.logEvent({ message: 'start sensor failed', device:this.getName(), reason:err.message, props });
        }       
    }


    async start( startProps?:AntDeviceProperties ): Promise<boolean> {
        const props = this.getStartProps(startProps) as AntDeviceProperties

        const preCheckResult = await this.startPreChecks(props)
        if (preCheckResult==='done')
            return this.started

        if (preCheckResult==='connection-failed')
            throw new Error(`could not start device, reason:could not connect`)
    
        this.logEvent( {message:'starting device', device:this.getName(), props, isStarted: this.started})

        this.resetStartStatus()
        this.resetData();      

        const {startupTimeout=this.getDefaultStartupTimeout()} = props
        const retryDelay = this.getDefaultReconnectDelay()
        const totalTimeout = Math.min( startupTimeout+10000, (startupTimeout+retryDelay)*MAX_RETRIES);
      

        const doStart =  async ()=>{
            let success = false;
            let retry =0;

            while (!success && retry<MAX_RETRIES && !this.startStatus.timeout && !this.startStatus.interrupted) {
                //if (retry!==0) {
                //    console.log('~~~ RETRY', status)
                //}
                try  {
                    retry++;

                    await this.initSensor(props);
                    await this.waitForInitialData(startupTimeout)

                    await this.checkCapabilities()                
                    if ( this.hasCapability( IncyclistCapability.Control ) )
                        await this.initControl()
                    
                    if (!this.startStatus.hasData && !this.startStatus.interrupted) {                    
                        await this.stopSensor()
                        await sleep(retryDelay)
                        continue
                    }
                    success = this.isStartSuccess()
                }
                catch(err) {
                    // istanbul ignore next
                    this.logEvent({message:'error',fn:'start#doStart', device:this.getName(),error:err.message, stack:err.stack})
                }
                
            }
            this.reportStartStatus()
            
            return this.started
    
        }

        try {
            await runWithTimeout(doStart(),totalTimeout)
        }
        catch(err) {
            if (err.message === 'Timeout') {
                this.started = false
                this.startStatus.timeout = true;
                this.logEvent( {message:'start device failed', device:this.getName(),reason:'timeout'})                
                throw new Error(`could not start device, reason:timeout`)   
            }
            throw err
        }

        return this.started;

    }


    async stop(): Promise<boolean> {
        let stopped;

        this.logger.logEvent( {message:'stopping device', device:this.getName()})

        // in case there was a start ongoing, enforce stop of waiting for data and interrup start
        this.promiseWaitForData = null;
        if (this.startStatus) {
            this.startStatus.interrupted = true
            await sleep(20)
        }
        try {
            stopped = await this.ant.stopSensor(this.sensor)
        }
        catch(err) {
            this.logEvent({message:'stop sensor failed', reason:err.message})
        }

        this.sensorConnected = false;
        this.started = false;
        this.stopped = true; 
        this.paused = false
        this.removeAllListeners()

        this.logEvent( {message:'stopping device finished', device:this.getName(),stopped})

        return stopped;
    }

    async startSensor() {
        return this.ant.startSensor(this.sensor, this.onDeviceData.bind(this))
    }

    async stopSensor() {
        if (!this.sensorConnected)
            return;

        try {
            await await this.ant.stopSensor(this.sensor);
            this.sensorConnected = false;
        }
        catch { }
    }


}


