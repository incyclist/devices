/* istanbul ignore file */

import {DeviceProtocol,Device} from './DeviceProtocol'
import CyclingMode from './CyclingMode'

export const DEFAULT_BIKE_WEIGHT = 10;
export const DEFAULT_USER_WEIGHT = 75;

export type DeviceData = {
    speed?: number;
    slope?: number;
    power?: number;
    cadence?: number;
    heartrate?: number;
    distance?: number;
    timestamp?: number;

    deviceTime?: number;
    deviceDistanceCounter?: number;
    internalDistanceCounter?: number;
}


export type OnDeviceDataCallback = ( data:DeviceData ) => void;
export type OnDeviceStartCallback = ( completed:number,total:number  ) => void;

export interface Bike {
    setCyclingMode(mode: CyclingMode|string, settings?:any):void
    getSupportedCyclingModes() : Array<any>     
    getCyclingMode(): CyclingMode
    getDefaultCyclingMode():CyclingMode

    setUserSettings(userSettings): void  
    setBikeSettings(bikeSettings):void

}

export interface DeviceAdapter extends Device {
    isBike(): boolean 
    isPower(): boolean
    isHrm(): boolean

    getID(): string
    getDisplayName(): string
    getName(): string
    getPort(): string
    getProtocol(): DeviceProtocol
    getProtocolName(): string

    setIgnoreHrm(ignore: boolean): void 
    setIgnorePower(ignore:boolean): void 
    setIgnoreBike(ignore:boolean): void 

    select(): void
    unselect(): void 
    isSelected(): boolean
    
    setDetected( detected?:boolean): void
    isDetected(): boolean
    
    start( props?: any ): Promise<any> 
    stop(): Promise<boolean> 
    pause(): Promise<boolean> 
    resume(): Promise<boolean> 

    sendUpdate(request): void
    onData( callback: OnDeviceDataCallback): void
}

/**
    * DeviceAdapterBase
    * 
    * Serves as base implementation class for Device Adapters
    * 
    * 
*/

export default class IncyclistDevice implements DeviceAdapter {

    protocol: DeviceProtocol;
    detected: boolean;
    selected: boolean;
    onDataFn: OnDeviceDataCallback;

    /**
        * @param {DeviceProtocol} proto The DeviceProtocol implementation that should be used to detect this type of device
    */
    constructor( proto: DeviceProtocol) {
        this.protocol= proto;
        this.detected = false;
        this.selected = false;
        this.onDataFn = undefined;
    }

    isBike():boolean {throw new Error('not implemented')}
    isPower():boolean {throw new Error('not implemented')}
    isHrm():boolean {throw new Error('not implemented')}

    getID():string { throw new Error('not implemented')}
    getDisplayName():string { return this.getName() }
    getName():string { throw new Error('not implemented')}
    getPort():string {throw new Error('not implemented')}
    getProtocol():DeviceProtocol {return this.protocol; }
    getProtocolName(): string| undefined {
        return this.protocol ? this.protocol.getName() : undefined;
    }
    setCyclingMode(mode: CyclingMode|string, settings?:any):void {}

    setIgnoreHrm(ignore) {}
    setIgnorePower(ignore) {}
    setIgnoreBike(ignore) {}

    select() { this.selected = true;}
    unselect() {this.selected = false;} 
    isSelected() { return this.selected} 
    setDetected( detected=true) { this.detected=detected}
    isDetected() {return this.detected}

    update() {}
    check() {}
    connect() {}
    close() {}
    
    start( props?: any ): Promise<any> {throw new Error('not implemented')}
    stop(): Promise<boolean> { throw new Error('not implemented')}
    pause(): Promise<boolean> { throw new Error('not implemented')}
    resume(): Promise<boolean> { throw new Error('not implemented')}

    sendUpdate(request) {}   
    onData( callback: OnDeviceDataCallback ) {
        this.onDataFn = callback;
    }

}