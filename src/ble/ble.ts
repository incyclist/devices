import EventEmitter from "events";
import { IncyclistScanProps } from "../types/device";
import { BleProtocol } from "./types";


export interface BleBinding extends EventEmitter {
    startScanning(serviceUUIDs?: string[], allowDuplicates?: boolean, callback?: (error?: Error) => void): void;
    stopScanning(callback?: () => void): void;
//    open(): {err: Error, opened: boolean}
    _bindings: any;
    state: string;
}



export interface BleScanProps extends IncyclistScanProps{
    protocol?: BleProtocol
    protocols?: BleProtocol[]    
    isBackgroundScan?: boolean    
}

export class BleBindingWrapper  {

    constructor(protected  binding: BleBinding) {
        this.binding = binding

    }
    
    open(): {err: Error, opened: boolean} {

        // Workaround: noble terminates if there is no adapter 
        const binding = this.binding._bindings
        const binding_init = binding.init.bind(binding);
        
        try {
            binding_init()
            return {err:null,opened:true}
        }
        catch (err) {
            const error = err;
            const opened = false;
            return {err:error, opened}
        }
    

    }

    get(): BleBinding {
        return this.binding
    }

}



export enum BleState  {
    UNKNOWN =  'unknown',
    RESETTING = 'resetting',
    UNSUPPORTED = 'unsupported',
    UNAUTHORIZED = 'unauthorized',
    POWERED_OFF = 'poweredOff',
    POWERED_ON = 'poweredOn',
}

