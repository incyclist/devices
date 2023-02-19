import EventEmitter from "events";
import { BleComms } from "./ble-comms";
import BlePeripheralConnector from "./ble-peripheral";
import { BleDeviceCommsClass, BleDeviceSettings, BlePeripheral, BlePeripheralIdentifier, ConnectProps,  } from "./types";


export interface BleBinding extends EventEmitter {
    startScanning(serviceUUIDs?: string[], allowDuplicates?: boolean, callback?: (error?: Error) => void): void;
    stopScanning(callback?: () => void): void;
//    open(): {err: Error, opened: boolean}
    _bindings: any;
    state: string;
}



export type BleScanProps ={
    timeout?: number;
    deviceTypes?: (typeof BleComms)[];
    requested?: BleComms|BleDeviceSettings;    
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

export abstract class BleInterfaceClass extends EventEmitter   {
    binding: BleBinding
    constructor (props: {binding?: BleBinding}={}) {
        super()
        this.setBinding(props.binding)
    }    

    abstract connect(props: ConnectProps): Promise<boolean> 
    abstract scan( props:BleScanProps) : Promise<BleDeviceCommsClass[]> 
    abstract stopScan() : Promise<boolean> 
    abstract disconnect() : Promise<boolean>
    abstract onDisconnect(peripheral: BlePeripheral) : void

    abstract isScanning(): boolean
    abstract addConnectedDevice(device: BleDeviceCommsClass):void
    abstract removeConnectedDevice(device: BleDeviceCommsClass):void
    abstract findConnected(device: BleDeviceCommsClass|BlePeripheral):BleDeviceCommsClass
    abstract getConnector(peripheral: BlePeripheral): BlePeripheralConnector
    abstract findPeripheral(peripheral:BlePeripheral | { id?:string, address?:string, name?:string}): BlePeripheral

    getBinding(): BleBinding { return this.binding }
    setBinding(binding: BleBinding) { this.binding = binding }

}





export enum BleState  {
    UNKNOWN =  'unknown',
    RESETTING = 'resetting',
    UNSUPPORTED = 'unsupported',
    UNAUTHORIZED = 'unauthorized',
    POWERED_OFF = 'poweredOff',
    POWERED_ON = 'poweredOn',
}

