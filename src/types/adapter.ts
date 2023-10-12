import EventEmitter from "events";
import ICyclingMode, { CyclingMode } from "../modes/types"
import { IncyclistCapability } from "./capabilities";
import { DeviceData } from "./data";
import { DeviceProperties, DeviceSettings } from "./device"
import { User } from "./user"
import { EventLogger } from "gd-eventlog";
import { DEFAULT_BIKE_WEIGHT, DEFAULT_PROPS, DEFAULT_USER_WEIGHT } from "../base/adpater";

export type OnDeviceDataCallback = ( data:DeviceData ) => void;

export interface IBike {
    isControllable():boolean

    setCyclingMode(mode: ICyclingMode|string, settings?:any,sendInitCommands?:boolean):void
    getSupportedCyclingModes() : Array<typeof CyclingMode>      
    getCyclingMode(): ICyclingMode
    getDefaultCyclingMode():ICyclingMode
    setBikeProps(props:DeviceProperties):void
    sendInitCommands():Promise<boolean>

    setUser(user:User): void  
    getWeight():number
    getUser():User
}


export interface IncyclistDeviceAdapter extends EventEmitter, IBike{

    getLogger(): EventLogger
    connect():Promise<boolean>
    close():Promise<boolean>

    check(): Promise<boolean> 
    isEqual(settings: DeviceSettings):boolean
    getCapabilities(): IncyclistCapability[]
    hasCapability(capability:IncyclistCapability):boolean
    addCapability(capability:IncyclistCapability):void
    isControllable():boolean

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
    
    getInterface(): string
    //@deprecate  ( use on('data) instead)
    onData( callback: OnDeviceDataCallback ) 
}


export class Controllable<P extends DeviceProperties> implements IBike {

    protected adapter:IncyclistDeviceAdapter
    protected props:P
    protected user:User

    constructor(adapter:IncyclistDeviceAdapter, props?:P) {
        this.adapter = adapter
        this.props = props || {} as P
        this.user = {}
    }
    isControllable(): boolean {
        throw new Error("Method not implemented.");
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
    async sendInitCommands():Promise<boolean> {
        throw new Error("Method not implemented.");
    }


    setUser(user: User): void {
        this.user = user;
        if (!user.weight)
            this.user.weight = DEFAULT_USER_WEIGHT
    }

    getUser():User{
        return this.user
    }

    setBikeProps(props:P) {


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



}
