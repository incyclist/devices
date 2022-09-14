import EventEmitter from "events";
import BlePeripheralConnector from "./ble-peripheral";

export type ConnectProps = {
    timeout?: number;
}

export interface BleDeviceIdentifier  {
    id?: string;
    address?: string;
    name?: string;
}

export interface ConnectState  {
    isConnecting: boolean;
    isConnected: boolean;
    isDisconnecting: boolean;
}
export type BleDeviceInfo = {
    manufacturer?: string;
    hwRevision?: string;
    swRevision?: string;
    fwRevision?: string;
    model?:string;
    serialNo?: string;

}

export interface BleDeviceDescription {
    id?: string;
    address: string;
    name?: string;
    profile: string;
}


export abstract class  BleDeviceClass extends EventEmitter { 
    static services: string[] = []
    id?: string;
    address?: string;
    name?: string;
    peripheral?: BlePeripheral;
    connectState: ConnectState = {  isConnecting: false, isConnected: false, isDisconnecting: false }

    getConnectState() {
        return this.connectState
    }

    isConnected() {
        return this.connectState.isConnected;
    }

    abstract getProfile(): string;
    abstract getServiceUUids(): string[] 
    abstract connect( props?:ConnectProps ): Promise<boolean>
    abstract disconnect(): Promise<boolean>
    abstract getDeviceInfo(): Promise<BleDeviceInfo> 


}


export interface BleBinding extends EventEmitter {
    startScanning(serviceUUIDs?: string[], allowDuplicates?: boolean, callback?: (error?: Error) => void): void;
    stopScanning(callback?: () => void): void;
//    open(): {err: Error, opened: boolean}
    _bindings: any;
    state: string;
}



export type ScanProps ={
    timeout?: number;
    deviceTypes?: (typeof BleDeviceClass)[];
    requested?: BleDeviceClass|BleDeviceDescription;    
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
    abstract scan( props:ScanProps) : Promise<BleDeviceClass[]> 
    abstract stopScan() : Promise<boolean> 
    abstract disconnect() : Promise<boolean>

    abstract isScanning(): boolean
    abstract addConnectedDevice(device: BleDeviceClass):void
    abstract removeConnectedDevice(device: BleDeviceClass):void
    abstract findConnected(device: BleDeviceClass|BlePeripheral):BleDeviceClass
    abstract getConnector(peripheral: BlePeripheral): BlePeripheralConnector
    abstract findPeripheral(peripheral:BlePeripheral | { id?:string, address?:string, name?:string}): BlePeripheral

    getBinding(): BleBinding { return this.binding }
    setBinding(binding: BleBinding) { this.binding = binding }

}


export interface BlePeripheral extends EventEmitter, BleDeviceIdentifier{
    services: string[];
    advertisement: any;
    state: string

    connectAsync(): Promise<void>;
    disconnect( cb:(err?:Error)=>void ): Promise<void>;
    discoverSomeServicesAndCharacteristicsAsync(serviceUUIDs: string[], characteristicUUIDs: string[]): Promise<any>;
    

}

export interface BleCharacteristic extends EventEmitter {
    uuid: string;
    properties: string[]

    subscribe( callback: (err:Error)=>void): void
    read( callback: (err:Error, data:Buffer)=>void): void
    write(data:Buffer, withoutResponse:boolean,callback?: (err:Error)=>void): void
}

export type BleDeviceProps = {
    id?: string;
    address?: string;
    name?: string;
    services?: string[];
    ble: BleInterfaceClass;
    peripheral?: BlePeripheral;
    
}



export enum BleState  {
    UNKNOWN =  'unknown',
    RESETTING = 'resetting',
    UNSUPPORTED = 'unsupported',
    UNAUTHORIZED = 'unauthorized',
    POWERED_OFF = 'poweredOff',
    POWERED_ON = 'poweredOn',
}

export const uuid = (s) => {
    //console.log(s)
    if (s) {
        if (s.includes('-')) {
            const parts = s.split('-')
            const uuidNo = parseInt('0x'+parts[0])
            return uuidNo.toString(16).toLowerCase()
        }
        return s;
    }
}
