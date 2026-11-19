import { EventEmitter } from "node:events";
import ICyclingMode, { CyclingMode, UpdateRequest } from "../modes/types.js"
import { IncyclistCapability } from "./capabilities.js";
import { IncyclistAdapterData } from "./data.js";
import { DeviceProperties, DeviceSettings } from "./device.js"
import { User } from "./user.js"
import { Sport } from "./sport.js";

export type OnDeviceDataCallback = ( data:IncyclistAdapterData ) => void;

export type ControllerConfig = {
    modes?: Array<typeof CyclingMode>
    default?: typeof CyclingMode
}

export type UpdateRequestInput = UpdateRequest & {
    enforced? : boolean
}

/**
 * Payload of the 'mode-replaced' adapter event.
 * Emitted when the adapter replaced the active cycling mode, because the requested mode is not supported
 * by the device (known only after the device features have been read)
 */
export type ModeReplacedInfo = {
    requestedMode: string
    newMode: string
}

/**
 * Typed events emitted by adapters (listener signatures by event name)
 */
export interface AdapterEvents {
    'mode-replaced': (info: ModeReplacedInfo) => void
}

export interface ITrainer {
    setCyclingMode(mode: ICyclingMode|string, settings?:any,sendInitCommands?:boolean):void
    getSupportedCyclingModes() : Array<typeof CyclingMode>      
    getCyclingMode(): ICyclingMode
    getDefaultCyclingMode():ICyclingMode
    setBikeProps(props:DeviceProperties):void

    // send Init Commands after cycle mode has changed
    sendInitCommands():Promise<boolean>
    sendUpdate(request:UpdateRequestInput):Promise<UpdateRequest|void>  

    setUser(user:User): void  
    getWeight():number
    getUser():User

    getSupportedSports?():Array<Sport>


}

export interface ISensor {
    isControllable():boolean
    getCapabilities(): IncyclistCapability[]
    hasCapability(capability:IncyclistCapability):boolean
    addCapability(capability:IncyclistCapability):void
    getMaxUpdateFrequency():number
    setMaxUpdateFrequency(value: number):void
    update():void
}


export interface IAdapter extends EventEmitter, ITrainer, ISensor{
    on<E extends keyof AdapterEvents>(event: E, listener: AdapterEvents[E]): this
    on(event: string | symbol, listener: (...args: any[]) => void): this
    emit<E extends keyof AdapterEvents>(event: E, ...args: Parameters<AdapterEvents[E]>): boolean
    emit(event: string | symbol, ...args: any[]): boolean

    getName(): string    
    getID(): string
    getUniqueName(): string
    supportsVirtualShifting(): boolean

    // @deprecate 
    getDisplayName(): string 

    getSettings(): DeviceSettings
    isSame(adapter:IAdapter):boolean
    isEqual(settings: DeviceSettings):boolean
    getInterface(): string
    
    check(): Promise<boolean> 
    start( props?: DeviceProperties ): Promise<boolean> 
    stop(): Promise<boolean> 
    pause(): Promise<boolean> 
    resume(): Promise<boolean> 
    connect():Promise<boolean>
    close():Promise<boolean>
    resetData():void

    onScanStart():void
    onScanStop():void

    createMode(ModeClass:typeof CyclingMode):ICyclingMode
    isLogPaused():boolean

    // true while the adapter is re-establishing a lost connection on its own - a restart should not be triggered then
    isReconnecting?():boolean
}

