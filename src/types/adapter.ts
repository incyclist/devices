
import { deprecate } from "util";
import CyclingMode from "../modes/cycling-mode"
import { IncyclistCapability } from "./capabilities";
import { DeviceData } from "./data";
import { DeviceProperties, DeviceSettings } from "./device"
import { User } from "./user"

const DEFAULT_UPDATE_FREQUENCY = 1000

export type OnDeviceDataCallback = ( data:DeviceData ) => void;

export interface IncyclistDeviceAdapter {
    connect():Promise<boolean>
    close():Promise<boolean>

    check(): Promise<boolean> 
    isEqual(settings: DeviceSettings)
    getCapabilities(): IncyclistCapability[]
    hasCapability(capability:IncyclistCapability)

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
