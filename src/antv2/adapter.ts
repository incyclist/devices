
import { IChannel, ISensor, Profile } from 'incyclist-ant-plus'
import AntInterface from './ant-interface';

import IncyclistDevice, { DEFAULT_BIKE_WEIGHT } from '../base/adpater';
import { AntDeviceProperties, AntDeviceSettings, isLegacyProfile, LegacyProfile } from './types';
import { DeviceProperties } from '../types/device';
import { Bike, IncyclistDeviceAdapter, OnDeviceDataCallback } from '../types/adapter';
import { sleep } from '../utils/utils';
import { IncyclistCapability } from '../types/capabilities';
import CyclingMode from '../modes/cycling-mode';
import { User } from '../types/user';
import { DEFAULT_USER_WEIGHT,DEFAULT_PROPS } from '../base/adpater';
import { getBrand, mapLegacyProfile } from './utils';

export const DEFAULT_UPDATE_FREQUENCY  = 1000;

const NO_DATA_TIMEOUT = 5000;
const INTERFACE_NAME = 'ant'

export type BaseDeviceData = {
    DeviceID: number;
    ManId?: number;
}

export default class AntAdapter<TDeviceData extends BaseDeviceData, TData> extends IncyclistDevice {

    sensor: ISensor;
    lastUpdate?: number;
    data: TData;
    deviceData: TDeviceData;
    updateFrequency: number;
    channel: IChannel;
    ant: AntInterface
    userSettings: { weight?:number};
    bikeSettings: { weight?:number};
    onDataFn: (data: TData) => void
    startupRetryPause: number = 1000;
    
    protected ivDataTimeout: NodeJS.Timer
    protected lastDataTS: number;
    protected dataMsgCount: number;
    protected ivWaitForData: NodeJS.Timer


    constructor ( settings:AntDeviceSettings, props?:DeviceProperties) {
        super(settings, props)

        const antSettings = this.settings as AntDeviceSettings

        if (isLegacyProfile(antSettings.profile))
            antSettings.profile = mapLegacyProfile(antSettings.profile as LegacyProfile)
        
        if (this.settings.interface!=='ant')
            throw new Error ('Incorrect interface')

        this.sensor = this.createSensor(settings)
        this.deviceData = {} as TDeviceData
        this.data = {} as TData
        this.dataMsgCount = 0;
        this.updateFrequency = DEFAULT_UPDATE_FREQUENCY;
        this.channel = undefined;
        this.ant = AntInterface.getInstance()
        

    }

    /* istanbul ignore next */
    createSensor(settings:AntDeviceSettings):ISensor {
        throw new Error('Method not implemented.');
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

    async close():Promise<boolean> { 
        return true  //TODO
    }
    
    resetData() {
        this.dataMsgCount = 0;
        const {DeviceID} = this.deviceData;
        this.deviceData = { DeviceID } as TDeviceData
        this.lastDataTS = undefined
    }


    isSame(device:IncyclistDeviceAdapter):boolean {
        if (!(device instanceof AntAdapter))
            return false;
        const adapter = device;
        return  (adapter.getID()===this.getID() && adapter.getProfile()===this.getProfile())
    }

    hasData():boolean {
        return this.dataMsgCount>0
    }

    onDeviceData( deviceData) {
        const {ManId} = this.deviceData

        this.deviceData = Object.assign( {},deviceData);
        if (!ManId && deviceData.ManId) {
            this.emit('device-info',{device:this.getSettings(), manufacturer: getBrand(deviceData.ManId)})
        }

    }


    async waitForData(timeout:number) {


        const startTs = Date.now();
        const timeoutTs = startTs + timeout;
        if (this.hasData())
            return true;

        return new Promise( (resolve,reject) => {
            

            if (this.ivWaitForData)
                return reject (new Error('busy'))

            this.ivWaitForData = setInterval( ()=> { 
                const nowTs = Date.now();
                const hasData = this.hasData()

                if (nowTs>timeoutTs && !hasData) {
                    clearInterval(this.ivWaitForData)
                    this.ivWaitForData = undefined;
                    reject( new Error('No Data Received'))
                }

                if (hasData) {
                    clearInterval(this.ivWaitForData)
                    this.ivWaitForData = undefined;
                    resolve( true)
                }
            }, 500)    
        })

    }





    getID(): string {
        return this.sensor.getDeviceID().toString();
    }

    getName(): string {
        const deviceID = this.sensor.getDeviceID();
        const profile  = this.sensor.getProfile();

        return `Ant+${profile} ${deviceID}`;
    }

    getInterface(): string {
        return INTERFACE_NAME
    }
    

    getProfile():Profile {
        const settings = this.settings as AntDeviceSettings
        if (settings.protocol===undefined)
            return settings.profile as Profile
        else { // Legacy 
            return mapLegacyProfile(settings.profile as LegacyProfile)
        } 
    }


    startDataTimeoutCheck() {
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

    stopDataTimeoutCheck() {
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

    async checkCapabilities():Promise<void> {
        return;
    }

    async initControl():Promise<void> {
        return;
    }

    async start( props: AntDeviceProperties={} ): Promise<boolean> {

        if (this.started)
            return true;

        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)
            

        return new Promise ( async (resolve, reject) => {


            this.resetData();      
            this.stopped = false;
    


            const {startupTimeout = 20000} = props
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
                await this.waitForData(startupTimeout-100)

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



}

export class ControllableAntAdapter<TDeviceData extends BaseDeviceData, TData> extends AntAdapter<TDeviceData, TData> implements Bike {
    cyclingMode: CyclingMode;
    user?:User;

    constructor( settings:AntDeviceSettings, props?:AntDeviceProperties) { 
        super(settings,props)
        this.cyclingMode = this.getDefaultCyclingMode()
        this.user = {}
    }

    isControllable(): boolean {
        return true;
    }
    
    setUser(user: User): void {
        this.user = user;
        if (!user.weight)
            this.user.weight = DEFAULT_USER_WEIGHT
    }


    setBikeProps(props:DeviceProperties) {

        const {user,userWeight} = props||{}
        if (user) 
            this.setUser(user)
        if (userWeight)
            this.user.weight = userWeight

        const keys = Object.keys(props)
        keys.forEach( k=> {
            const p = props[k]
            if (p===null) 
                delete this.props[k]
            else if (p!==undefined)
                this.props[k] = p;
        })
    }

    getWeight():number {

        const {user={},props=DEFAULT_PROPS} = this;
        const userWeight = user.weight||props.userWeight||DEFAULT_USER_WEIGHT;
        const bikeWeight = props.bikeWeight ||DEFAULT_BIKE_WEIGHT;
        return userWeight+bikeWeight
    }


    getSupportedCyclingModes(): any[] {throw new Error('not implemented')}
    getDefaultCyclingMode(): CyclingMode {throw new Error('not implemented')}

    setCyclingMode(mode: CyclingMode|string, settings?:any):void  { 
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

    getCyclingMode(): CyclingMode {
        if (!this.cyclingMode)
            this.setCyclingMode( this.getDefaultCyclingMode());
        return this.cyclingMode;

    }

}

