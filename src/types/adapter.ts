import EventEmitter from "events";
import ICyclingMode, { CyclingMode, UpdateRequest } from "../modes/types"
import { IncyclistCapability } from "./capabilities";
import { IncyclistAdapterData } from "./data";
import { DeviceProperties, DeviceSettings } from "./device"
import { User } from "./user"

export type OnDeviceDataCallback = ( data:IncyclistAdapterData ) => void;

export type ControllerConfig = {
    modes?: Array<typeof CyclingMode>
    default?: typeof CyclingMode
}

export interface IBike {
    setCyclingMode(mode: ICyclingMode|string, settings?:any,sendInitCommands?:boolean):void
    getSupportedCyclingModes() : Array<typeof CyclingMode>      
    getCyclingMode(): ICyclingMode
    getDefaultCyclingMode():ICyclingMode
    setBikeProps(props:DeviceProperties):void

    // send Init Commands after cycle mode has changed
    sendInitCommands():Promise<boolean>
    sendUpdate(request):Promise<UpdateRequest|void>  

    setUser(user:User): void  
    getWeight():number
    getUser():User
}

export interface ISensor {
    isControllable():boolean
    getCapabilities(): IncyclistCapability[]
    hasCapability(capability:IncyclistCapability):boolean
    addCapability(capability:IncyclistCapability):void
    getMaxUpdateFrequency()
    setMaxUpdateFrequency(value: number) 
    update() 
}


export interface IAdapter extends EventEmitter, IBike, ISensor{
    getName(): string    
    getID(): string
    getUniqueName(): string

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


    //@deprecate  ( use on('data) instead)
    onData( callback: OnDeviceDataCallback ) 
}

