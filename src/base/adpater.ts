import { EventEmitter } from "stream";

import CyclingMode from "../modes/cycling-mode";
import { DeviceProperties, DeviceSettings } from "../types/device";
import {Bike, IncyclistDeviceAdapter, OnDeviceDataCallback} from '../types/adapter'
import { User } from "../types/user";
import { IncyclistCapability } from "../types/capabilities";
import { EventLogger } from "gd-eventlog";
import { DeviceData } from "../types/data";

export const DEFAULT_BIKE_WEIGHT = 10;
export const DEFAULT_USER_WEIGHT = 75;

export const DEFAULT_PROPS: DeviceProperties = {
    userWeight: DEFAULT_USER_WEIGHT,
    bikeWeight: DEFAULT_BIKE_WEIGHT

}

export default class IncyclistDevice extends EventEmitter implements IncyclistDeviceAdapter  {

    onDataFn: OnDeviceDataCallback;
    settings: DeviceSettings;
    props: DeviceProperties
    lastUpdate?: number;

    capabilities: IncyclistCapability[]
    protected logger: EventLogger
    started: boolean
    stopped: boolean
    paused: boolean;


    /**
        * @param {DeviceSettings}   settings    A Json Object that defines all neccessary parameters of the device (interface, port, ...)
        * @param {DeviceProperties} settings    Adapter Specific Configuration Properties ( e.. User/ User weight, Bike weight, ...)
    */
    constructor( settings:DeviceSettings, props?:DeviceProperties) {
        super();
        this.onDataFn = undefined;
        this.settings = settings;
        this.props = props||{}
        this.capabilities = []
        this.started = false;
        this.stopped = false;
        this.paused = false
    }
    connect():Promise<boolean> { throw new Error('not implemented') }
    close():Promise<boolean> { throw new Error('not implemented') }
    check(): Promise<boolean> {throw new Error("Method not implemented.");}

    isEqual(settings: DeviceSettings) {throw new Error("Method not implemented.");}
    getCapabilities(): IncyclistCapability[] { return this.capabilities }
    hasCapability(capability: IncyclistCapability) { 
        
        return this.capabilities.find(c => c===capability)!==undefined
    }
    update() {throw new Error("Method not implemented."); }
    start(props?: DeviceProperties): Promise<boolean> { throw new Error("Method not implemented.");}
    stop(): Promise<boolean> { throw new Error("Method not implemented.");}

    async pause(): Promise<boolean> {
        this.paused = true;
        return true;
    }

    async resume(): Promise<boolean> {
        this.paused = false;
        return true;
    }

    logEvent( event) {
        if (!this.logger)
            return;
        this.logger.logEvent(event)
    }


    sendUpdate(request: any) { throw new Error("Method not implemented."); }


    getID():string { throw new Error('not implemented')}
    
    getDisplayName():string { 
        return this.getName()
    }

    getName():string { 
        return this.settings.name
    }
    

    getSettings(): DeviceSettings {
        return this.settings;
    }

    getInterface(): string {
        return  typeof this.settings.interface==='string' ? this.settings.interface : this.settings.interface.getName()
    }


    onData( callback: OnDeviceDataCallback ) {
        this.onDataFn = callback;
    }

    isStopped() {
        return this.stopped;
    }
    isStarted() {
        return this.started;
    }
    isPaused() {
        return this.paused
    }

    emitData(data:DeviceData) {
        if( this.onDataFn)
            this.onDataFn(data)
        this.emit('data', this.getSettings(), data)    
        this.lastUpdate = Date.now();    
    }

    hasDataListeners() {
        return this.onDataFn || this.listenerCount('data')>0
    }


}



export class ControllableDevice extends IncyclistDevice implements Bike{
    cyclingMode: CyclingMode;
    user?:User;

    constructor( settings:DeviceSettings, props?:DeviceProperties) { 
        super(settings,props)
        this.cyclingMode = this.getDefaultCyclingMode()
        this.user = {}
    }

    setUser(user: User): void {
        this.user = user;
        if (!user.weight)
            this.user.weight = DEFAULT_USER_WEIGHT
    }


    setBikeProps(props:DeviceProperties) {

        const {user,userWeight,bikeWeight} = props||{}
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
