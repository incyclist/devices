import ICyclingMode,{ CyclingMode } from "../modes/types";
import { DeviceProperties, DeviceSettings  } from "../types/device";
import { Controllable, IncyclistDeviceAdapter, OnDeviceDataCallback} from '../types/adapter'
import { User } from "../types/user";
import { IncyclistCapability } from "../types/capabilities";
import { EventLogger } from "gd-eventlog";
import { DeviceData } from "../types/data";
import EventEmitter from "events";
import { CyclingModeBase } from "../modes/base";

export const DEFAULT_BIKE_WEIGHT = 10;
export const DEFAULT_USER_WEIGHT = 75;

export const DEFAULT_PROPS: DeviceProperties = {
    userWeight: DEFAULT_USER_WEIGHT,
    bikeWeight: DEFAULT_BIKE_WEIGHT

}

export default class IncyclistDevice<B extends Controllable<P>, P extends DeviceProperties> 
                extends EventEmitter 
                implements IncyclistDeviceAdapter  {

    onDataFn: OnDeviceDataCallback;
    settings: DeviceSettings;
    lastUpdate?: number;
    updateFrequency: number;

    capabilities: IncyclistCapability[]
    protected logger: EventLogger
    started: boolean
    stopped: boolean
    paused: boolean;

    bikeControl: B
    props: DeviceProperties


    /**
        * @param {DeviceSettings}   settings    A Json Object that defines all neccessary parameters of the device (interface, port, ...)
        * @param {DeviceProperties} settings    Adapter Specific Configuration Properties ( e.. User/ User weight, Bike weight, ...)
    */
    constructor( settings:DeviceSettings, props?:DeviceProperties) {
        super();
        this.onDataFn = undefined;
        this.settings = settings;
        this.props = props|| {} as unknown as P
        this.capabilities = []
        this.started = false;
        this.stopped = false;
        this.paused = false
        this.bikeControl = new NonControllableDevice(this,props) as B
    }

    setControl(control:B) {       
        this.bikeControl = control;
    }

    connect():Promise<boolean> { throw new Error('not implemented') }
    close():Promise<boolean> { throw new Error('not implemented') }
    check(): Promise<boolean> {throw new Error("Method not implemented.");}
    getLogger(): EventLogger { return this.logger}

    isControllable(): boolean {
        return this.bikeControl?.isControllable()
    }   
    isEqual(settings: DeviceSettings):boolean {throw new Error("Method not implemented.");}
    getCapabilities(): IncyclistCapability[] { return this.capabilities }
    hasCapability(capability: IncyclistCapability):boolean {         
        return this.capabilities.find(c => c===capability)!==undefined
    }
    addCapability(capability:IncyclistCapability ):void {
        if (!this.capabilities.includes(capability))
            this.capabilities.push(capability)
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

        if (!this.logger || this.paused)
            return;
        this.logger.logEvent(event)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
  

        if (w?.DEVICE_DEBUG||process.env.BLE_DEBUG || process.env.ANT_DEBUG) {
            const logText = '~~~ '+this.logger.getName()
            console.log(logText,event)
        }
    }
    getMaxUpdateFrequency(): number {
        return this.updateFrequency;
    }
    setMaxUpdateFrequency(value: number) {
        this.updateFrequency = value;
    }


    sendUpdate(request: any) { throw new Error("Method not implemented."); }


    getID():string { throw new Error('not implemented')}
    
    getDisplayName():string { 
        return this.getName()
    }

    getName():string { 
        return this.settings.name
    }
    getUniqueName(): string {
        throw new Error("Method not implemented."); 
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

    canSendUpdate() {
        const updateFrequency = this.getMaxUpdateFrequency()
        if (updateFrequency===-1 || updateFrequency===undefined)
            return true

        return (!this.lastUpdate || (Date.now()-this.lastUpdate)>updateFrequency)        
    }

    emitData(data:DeviceData) {
        if (!this.canSendUpdate())
            return;

        if( this.onDataFn)
            this.onDataFn(data)
        this.emit('data', this.getSettings(), data)    
        this.lastUpdate = Date.now();    
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

    hasDataListeners() {
        return this.onDataFn || this.listenerCount('data')>0
    }

    setCyclingMode(mode: string | ICyclingMode, settings?: any, sendInitCommands?: boolean): void {
        if (this.isControllable())
            this.bikeControl?.setCyclingMode(mode,settings,sendInitCommands)
    }
    getSupportedCyclingModes(): any[] {
        if (!this.isControllable())
            return [];

        return this.bikeControl?.getSupportedCyclingModes()
    }

    getCyclingMode(): ICyclingMode {
        if (this.isControllable())
            return this.bikeControl.getCyclingMode()
    }
    getDefaultCyclingMode(): ICyclingMode {
        if (this.isControllable())
            return this.bikeControl.getDefaultCyclingMode()
    }
    setBikeProps(props: P): void {
        if (this.isControllable())
            this.bikeControl.setBikeProps(props)
    }
    setUser(user: User): void {
        if (this.isControllable())
            this.bikeControl.setUser(user)
    }

    getUser():User {
        return this.bikeControl?.getUser() || {}

    }
    getWeight(): number {
        return this.bikeControl?.getWeight()
    }

    async sendInitCommands():Promise<boolean> {
        if (this.isControllable())
            return await this.bikeControl.sendInitCommands()
        return false;
    }



}


export class NonControllableDevice<P extends DeviceProperties> extends Controllable<P>{

    isControllable(): boolean {
        return false
    }

    setCyclingMode(mode: string | ICyclingMode, settings?: any, sendInitCommands?: boolean): void {
        throw new Error("Method not implemented.");
    }
    getSupportedCyclingModes(): Array<typeof CyclingMode> {
        throw new Error("Method not implemented.");
    }
    getCyclingMode(): ICyclingMode {
        throw new Error("Method not implemented.");
    }
    getDefaultCyclingMode(): ICyclingMode {
        throw new Error("Method not implemented.");
    }
    setBikeProps(props: DeviceProperties): void {
        throw new Error("Method not implemented.");
    }
    setUser(user: User): void {
        throw new Error("Method not implemented.");
    }
    async sendInitCommands():Promise<boolean> {
        return false;
    }

}



export class ControllableDevice<P extends DeviceProperties> extends Controllable<P>{
    protected cyclingMode: ICyclingMode;

    constructor( adapter:IncyclistDeviceAdapter, props?:P) { 
        super(adapter,props)
        this.cyclingMode = this.getDefaultCyclingMode()
    }

    isControllable(): boolean {
        return true
    }
 

    getSupportedCyclingModes(): Array<typeof CyclingMode> {throw new Error('not implemented')}
    getDefaultCyclingMode(): ICyclingMode {throw new Error('not implemented')}

    setCyclingMode(mode: ICyclingMode|string, settings?:any):void  { 
        let selectedMode :ICyclingMode;

        if ( typeof mode === 'string') {
            const supported = this.getSupportedCyclingModes();
            const CyclingModeClass = supported.find( M => { const m = new M(this.adapter); return m.getName() === mode })
            if (CyclingModeClass) {
                this.cyclingMode = new CyclingModeClass(this.adapter,settings);    
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

    async sendInitCommands():Promise<boolean> {
        return true;
    }


    getCyclingMode(): ICyclingMode {
        if (!this.cyclingMode)
            this.setCyclingMode( this.getDefaultCyclingMode());
        return this.cyclingMode;

    }

    getWeight():number {

        const {user={},props=DEFAULT_PROPS} = this;
        const userWeight = user.weight||props.userWeight||DEFAULT_USER_WEIGHT;
        const bikeWeight = props.bikeWeight ||DEFAULT_BIKE_WEIGHT;
        return userWeight+bikeWeight
    }


}
