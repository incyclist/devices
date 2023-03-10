import EventEmitter from "events";
import CyclingMode from "../modes/cycling-mode"
import { IncyclistCapability } from "./capabilities";
import { DeviceData } from "./data";
import { DeviceProperties, DeviceSettings } from "./device"
import { User } from "./user"

export type OnDeviceDataCallback = ( data:DeviceData ) => void;

export interface IncyclistDeviceAdapter extends EventEmitter{
    connect():Promise<boolean>
    close():Promise<boolean>

    check(): Promise<boolean> 
    isEqual(settings: DeviceSettings):boolean
    getCapabilities(): IncyclistCapability[]
    hasCapability(capability:IncyclistCapability):boolean
    addCapability(capability:IncyclistCapability):void

    getName(): string    
    getUniqueName(): string
    getSettings(): DeviceSettings
    getDisplayName(): string 



    update() 
    
    start( props?: DeviceProperties ): Promise<boolean> 
    stop(): Promise<boolean> 
    pause(): Promise<boolean> 
    resume(): Promise<boolean> 

    sendUpdate(request)  

    getMaxUpdateFrequency()
    setMaxUpdateFrequency(value: number) 
    
    //@deprecate  ( use on('data) instead)
    onData( callback: OnDeviceDataCallback ) 
}

export interface Bike {
    setCyclingMode(mode: CyclingMode|string, settings?:any):void
    getSupportedCyclingModes() : Array<any>     
    getCyclingMode(): CyclingMode
    getDefaultCyclingMode():CyclingMode
    setBikeProps(props:DeviceProperties):void

    setUser(user:User): void  
}
