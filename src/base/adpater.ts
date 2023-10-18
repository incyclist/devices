import ICyclingMode,{ CyclingMode } from "../modes/types";
import { DeviceProperties, DeviceSettings,ControllerConfig, IAdapter, OnDeviceDataCallback,IncyclistCapability,IncyclistAdapterData,User  } from "../types";
import { EventLogger } from "gd-eventlog";
import EventEmitter from "events";
import { DEFAULT_PROPS, DEFAULT_USER_WEIGHT, DEFAULT_BIKE_WEIGHT } from "./consts";

export default class IncyclistDevice<P extends DeviceProperties> 
                extends EventEmitter 
                implements IAdapter  {

    onDataFn: OnDeviceDataCallback;
    settings: DeviceSettings;
    lastUpdate?: number;
    updateFrequency: number;

    capabilities: IncyclistCapability[]
    started: boolean
    stopped: boolean
    paused: boolean;

    protected props: P
    protected cyclingMode: ICyclingMode;
    protected logger: EventLogger
    protected static controllers:ControllerConfig = {}
    protected user:User
    protected data:IncyclistAdapterData

    /**
        * @param {DeviceSettings}   settings    A Json Object that defines all neccessary parameters of the device (interface, port, ...)
        * @param {DeviceProperties} settings    Adapter Specific Configuration Properties ( e.. User/ User weight, Bike weight, ...)
    */
    constructor( settings:DeviceSettings, props?:P) {
        super();


        this.onDataFn = undefined;
        this.settings = settings;
        this.props = props|| {} as unknown as P
        this.capabilities = []
        this.started = false;
        this.stopped = false;
        this.paused = false
        this.user = {}
        this.data = {}
        this.cyclingMode = this.getDefaultCyclingMode()
    }

    getLogger(): EventLogger { return this.logger}

    isDebugEnabled() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
  
        if (w?.DEVICE_DEBUG||process.env.BLE_DEBUG || process.env.ANT_DEBUG) {
            return true;
        }
        return false;
    }

    logEvent( event) {

        if (!this.logger || this.paused)
            return;

        this.logger.logEvent(event)

        if (this.isDebugEnabled()) {
            const logText = `~~~ ${this.getInterface()}: ${this.logger.getName()}`
            console.log(logText,event)
        }
    }


    // --------------------------------------------------------
    // Adapter Interface
    // --------------------------------------------------------
    getName():string { 
        return this.settings.name
    }
    getID():string { return ''}

    getUniqueName(): string {
        throw new Error("Method not implemented."); 
    } 
    getDisplayName():string { 
        return this.getName()
    }
    getSettings(): DeviceSettings {
        return this.settings;
    }

    isSame(adapter:IAdapter):boolean {throw new Error("Method not implemented.");}
    isEqual(settings: DeviceSettings):boolean {throw new Error("Method not implemented.");}

    getInterface(): string {
        return  typeof this.settings.interface==='string' ? this.settings.interface : this.settings.interface.getName()
    }

    check(): Promise<boolean> {throw new Error("Method not implemented.");}
    start(props?: DeviceProperties): Promise<boolean> { throw new Error("Method not implemented.");}
    stop(): Promise<boolean> { throw new Error("Method not implemented.");}
    
    async pause(): Promise<boolean> {
        if (this.isStarted() && !this.isStopped())
            this.logEvent( {message:'pausing device', device:this.getName()})

        this.paused = true;
        return true;
    }

    async resume(): Promise<boolean> {
        if (this.isStarted() && !this.isStopped())
            this.logger.logEvent( {message:'resuming device', device:this.getName()})
        this.paused = false;
        return true;
    }
    connect():Promise<boolean> { throw new Error('not implemented') }
    close():Promise<boolean> { throw new Error('not implemented') }


    // --------------------------------------------------------
    // Sensor interface
    // --------------------------------------------------------
    getControllerInfo():ControllerConfig|undefined {
        const a = this.constructor as typeof IncyclistDevice<P> 
        const config = a.controllers
        if (!config)
            return undefined;

        if (config.modes &&  config.modes.length>0) {
            if (!config.default) 
                config.default = config.modes[0]
            return config
        }

        return undefined
    }

    isControllable(): boolean {
        if (!this.getControllerInfo())
            return false;
        return true;
    }   

    getCapabilities(): IncyclistCapability[] { return this.capabilities }
    hasCapability(capability: IncyclistCapability):boolean {         
        return this.capabilities.find(c => c===capability)!==undefined
    }
    addCapability(capability:IncyclistCapability ):void {
        if (!this.capabilities.includes(capability))
            this.capabilities.push(capability)
    }
    getMaxUpdateFrequency(): number {
        return this.updateFrequency;
    }
    setMaxUpdateFrequency(value: number) {
        this.updateFrequency = value;
    }
    update() {throw new Error("Method not implemented."); }


    // --------------------------------------------------------
    // Bike Interface
    // --------------------------------------------------------

    setCyclingMode(mode: string | ICyclingMode, settings?: any, sendInitCommands?: boolean): void {
        if (!this.isControllable())
            return;

        let selectedMode :ICyclingMode;

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

    getSupportedCyclingModes() : Array<typeof CyclingMode>  {
        if (!this.isControllable())
            return [];
        const config = this.getControllerInfo()    
        return config.modes
    }

    getCyclingMode(): ICyclingMode {
        if (this.isControllable())
            return this.cyclingMode
    }

    getDefaultCyclingMode(): ICyclingMode {
        if (!this.isControllable())
            return;

        const config = this.getControllerInfo()    
        const C = config.default

        try {
            return new C(this)
        }
        catch(err) {
            this.logEvent({message:'error', error:err.message, fn:'getDefaultCyclingMode', stack:err.stack})

        }
    }

    setBikeProps(props: P): void {
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

    async sendInitCommands():Promise<boolean> {
        return false;
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

    setUser(user: User): void {
        this.user = user;
        if (!user.weight)
            this.user.weight = DEFAULT_USER_WEIGHT
    }

    getUser():User {
        return this.user

    }
    getWeight():number {
        const {user={},props=DEFAULT_PROPS} = this;
        const userWeight = user.weight||props.userWeight||DEFAULT_USER_WEIGHT;
        const bikeWeight = props.bikeWeight ||DEFAULT_BIKE_WEIGHT;
        return userWeight+bikeWeight
    }


    // --------------------------------------------------------
    // helpers
    // --------------------------------------------------------

    isUpdateWithinFrequency():boolean {
        const updateFrequency = this.getMaxUpdateFrequency()
        if (updateFrequency===-1 || updateFrequency===undefined)
            return true

        return (!this.lastUpdate || (Date.now()-this.lastUpdate)>updateFrequency)        

    }

    canEmitData() {
        if (this.paused || this.stopped)
            return false

        return this.isUpdateWithinFrequency()
    }

    emitData(data:IncyclistAdapterData) {
        if (!this.canEmitData())
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

    getData() {
        return this.data
    }

    //@deprecate  ( use on('data) instead)
    hasDataListeners() {
        return this.onDataFn || this.listenerCount('data')>0
    }

    //@deprecate  ( use on('data) instead)
    onData( callback: OnDeviceDataCallback ) {
        this.onDataFn = callback;
    }
}

export type IncyclistDeviceAdapter = IncyclistDevice<DeviceProperties>



