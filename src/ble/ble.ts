import EventEmitter from "events";
import { IncyclistScanProps } from "../types/device";
import { BleProtocol } from "./types";


export interface BleBinding extends EventEmitter {
    startScanning(serviceUUIDs?: string[], allowDuplicates?: boolean, callback?: (error?: Error) => void): void;
    stopScanning(callback?: () => void): void;
//    open(): {err: Error, opened: boolean}
    _bindings: any;
    state: string;
    on(eventName: string | symbol, listener: (...args: any[]) => void):this

}



export interface BleScanProps extends IncyclistScanProps{
    protocol?: BleProtocol
    protocols?: BleProtocol[]    
    isBackgroundScan?: boolean    
}


export enum BleState  {
    UNKNOWN =  'unknown',
    RESETTING = 'resetting',
    UNSUPPORTED = 'unsupported',
    UNAUTHORIZED = 'unauthorized',
    POWERED_OFF = 'poweredOff',
    POWERED_ON = 'poweredOn',
}

