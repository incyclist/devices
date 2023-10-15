
import { IChannel, ISensor, Profile } from 'incyclist-ant-plus'
import AntInterface from './ant-interface';

import IncyclistDevice from '../../base/adpater';
import { AntDeviceProperties, AntDeviceSettings, isLegacyProfile, LegacyProfile,BaseDeviceData } from '../types';
import { IAdapter,IncyclistAdapterData,IncyclistBikeData,IncyclistCapability } from '../../types';
import { runWithTimeout, sleep } from '../../utils/utils';
import { getBrand, mapLegacyProfile } from '../utils';
import { DEFAULT_UPDATE_FREQUENCY, NO_DATA_TIMEOUT } from '../consts';
import SensorFactory from '../factories/sensor-factory';
import { EventLogger } from 'gd-eventlog';

const INTERFACE_NAME = 'ant'

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
    startupRetryPause: number = 1000;
    
    protected ivDataTimeout: NodeJS.Timeout
    protected lastDataTS: number;
    protected dataMsgCount: number;
    protected ivWaitForData: NodeJS.Timeout
    protected promiseWaitForData: Promise<boolean>


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

        this.deviceData = {
            DeviceID: Number(settings.deviceID )
        } as TDeviceData;

        this.data = {} as IncyclistAdapterData
        this.dataMsgCount = 0;
        this.logger = new EventLogger(`Ant+${profile}`)

        this.updateFrequency = DEFAULT_UPDATE_FREQUENCY;
        this.channel = undefined;
        this.ant = AntInterface.getInstance()
    }

    getProfileName():Profile  {
        const C = this.constructor as typeof AntAdapter<TDeviceData>
        return C['ANT_PROFILE_NAME']
    }

    getLegacyProfileName():LegacyProfile {
        const C = this.constructor as typeof AntAdapter<TDeviceData>
        return C['INCYCLIST_PROFILE_NAME']
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
            
            if (!this.started || this.isStopped())
                return;
    
            this.triggerTimeoutCheck()
    
    
            if (!this.canEmitData()) 
                return;

            const logData = this.getLogData(deviceData, ['PairedDevices','RawData']);
            this.logEvent( {message:'onDeviceData',data:logData, paused:this.paused})
            
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
            try {
                const hasData = await runWithTimeout(this.promiseWaitForData,timeout)
                if (hasData || Date.now()-tsStart>timeout)
                    return hasData
            }
            catch{
                timeout -= (Date.now()-tsStart)
                if (timeout<0)
                    return false
            }
        }
        
        try {            
            this.promiseWaitForData = runWithTimeout(this._wait(),timeout)
            await this.promiseWaitForData
            this.promiseWaitForData =null;
            return true
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
        const deviceID = this.sensor.getDeviceID();
        const profile  = this.sensor.getProfile();

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


    triggerTimeoutCheck() {
        if ( !this.ivDataTimeout && this.dataMsgCount>0) {        
            this.startDataTimeoutCheck()
        }
    }


    startDataTimeoutCheck():void {
        if (this.ivDataTimeout)
            return;

        this.ivDataTimeout = setInterval( ()=>{
            if (!this.lastDataTS)
                return;

            if (this.lastDataTS+NO_DATA_TIMEOUT<Date.now()) {
                this.emit('disconnected', Date.now()-this.lastDataTS)
            }
        }, 1000)
    }

    stopDataTimeoutCheck():void {
        if (!this.ivDataTimeout)
            return;
        clearInterval(this.ivDataTimeout)

        this.ivDataTimeout = undefined
        this.lastDataTS = undefined
        this.dataMsgCount = 0;
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

    sendUpdate(request: any) { 
        if (!this.isControllable())
            return;

        if (this.isPaused() || this.isStopped())
            return;

        // in case the adapter is not abel to control the device, we are calling the Cycling Mode to adjust slope
        // Otherwise the method needs to be overwritten
        if (!this.hasCapability(IncyclistCapability.Control))
            this.getCyclingMode().sendBikeUpdate(request) 
        else 
            throw new Error('method not implemented')
    }

    async start( props: AntDeviceProperties={} ): Promise<boolean> {

        if (this.started && !this.stopped ) {
            if (this.paused)
                this.resume()
            return true;
        }

        this.stopped = false;

        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)
            

        return new Promise ( async (resolve, reject) => {


            this.resetData();      
            this.stopped = false;
            this.resume()
    


            const {startupTimeout = this.getDefaultStartupTimeout()} = props
            let to = setTimeout( async ()=>{
                try { await this.stop() } catch {}
                this.started = false;
                reject(new Error(`could not start device, reason:timeout`))
            }, startupTimeout)
            

            let started = false
            do {
                started = await this.ant.startSensor(this.sensor,(data) => {
                    this.onDeviceData(data)
                })
                if (!started)
                    await sleep(this.startupRetryPause)
            }
            while (!started)

            try {

                this.logEvent({ message: 'wait for sensor data', });   
                const hasData = await this.waitForData(startupTimeout-100)
                if (!hasData)
                    throw new Error('timeout')

                this.logEvent({ message: 'sensor data received', });

                await this.checkCapabilities()
                if ( this.hasCapability( IncyclistCapability.Control ) )
                    await this.initControl()

                this.started = true;
                if (to) clearTimeout(to)
                resolve(true)
    
            }
            catch(err) {
                // will generate a timeout
            }

    
        })
    }


    async stop(): Promise<boolean> {
        let stopped;
        try {
            this.stopDataTimeoutCheck()

            stopped = await this.ant.stopSensor(this.sensor)
        }
        catch(err) {
            this.logEvent({message:'stop sensor failed', reason:err.message})
        }

        this.started = false;
        this.stopped = true; 
        this.paused = false
        this.removeAllListeners()
        return stopped;
    }

    async startSensor() {
        return this.ant.startSensor(this.sensor, this.onDeviceData.bind(this))
    }



}


