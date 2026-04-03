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
}

