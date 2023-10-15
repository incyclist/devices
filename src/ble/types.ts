import EventEmitter from "events";
import { EventLogger } from "gd-eventlog";
import { DeviceProperties, DeviceSettings, DeviceStartProperties, IncyclistScanProps,InterfaceProps } from "../types";


export type BleProtocol = 'hr' | 'fm' | 'cp' | 'tacx' | 'wahoo' | 'elite'
export type BleInterfaceState  =  'unknown' | 'resetting' | 'unsupported' | 'unauthorized' | 'poweredOff'|  'poweredOn'


export interface BleBinding extends EventEmitter {
    startScanning(serviceUUIDs?: string[], allowDuplicates?: boolean, callback?: (error?: Error) => void): void;
    stopScanning(callback?: () => void): void;
//    open(): {err: Error, opened: boolean}
    _bindings: any;
    state: BleInterfaceState;
    on(eventName: string | symbol, listener: (...args: any[]) => void):this

}



export interface BleScanProps extends IncyclistScanProps{
    protocol?: BleProtocol
    protocols?: BleProtocol[]    
    isBackgroundScan?: boolean    
}



export interface BleDeviceConstructProps extends BleDeviceProps {
    log?: boolean;
    logger?: EventLogger;
    peripheral?: BlePeripheral
}


export interface BleDeviceSettings extends DeviceSettings {
    id?: string;
    protocol: BleProtocol;
    profile?:string; // Legacy
    address?: string;    
    name?: string;
}

export interface BleDetectedDevice extends BleDeviceSettings {
    peripheral: BlePeripheral
}

export interface BleDeviceProperties extends DeviceProperties {
    wheelDiameter?:number, 
    gearRatio?:number
}

export interface BleStartProperties extends DeviceStartProperties {
    wheelDiameter?:number, 
    gearRatio?:number
    restart?:boolean
    scanOnly?:boolean
}

export interface BleInterfaceProps extends InterfaceProps {
    binding?: BleBinding
    timeout?: number;
    reconnect?: boolean;
}

export type BleService = {
    uuid: string;
}

export type DiscoverResult = {
    services: BleService[]
    characteristics: BleCharacteristic[]
}

export interface BlePeripheral extends EventEmitter, BlePeripheralIdentifier{
    services: [];
    advertisement: any;
    state: string

    connectAsync(): Promise<void>;
    disconnect( cb:(err?:Error)=>void ): Promise<void>;
    discoverSomeServicesAndCharacteristicsAsync(serviceUUIDs: string[], characteristicUUIDs: string[]): Promise<DiscoverResult>;
    

}

export interface IBlePeripheralConnector {
    connect():Promise<void>,
    reconnect():Promise<void> 
    initialize(enforce:boolean):Promise<boolean>
    isSubscribed( characteristicUuid:string):boolean
    subscribeAll( callback:(characteristicUuid:string, data)=>void): Promise<string[]> 
    subscribe( characteristicUuid:string, timeout?:number): Promise<boolean>
    onDisconnect():void
    onData( characteristicUuid:string, data):void

    on( characteristicUuid:string, callback:(characteristicUuid:string, data)=>void):void
    off( characteristicUuid:string, callback:(characteristicUuid:string, data)=>void):void
    removeAllListeners(characteristicUuid:string):void

    getState():string 
    getCharachteristics():BleCharacteristic [] 
    getServices():string[] 
    getPeripheral(): BlePeripheral 
}

export interface BleCharacteristic extends EventEmitter {
    uuid: string;
    properties: string[];
    _serviceUuid?: string;
    name?: string;

    subscribe( callback: (err:Error|undefined)=>void): void
    unsubscribe( callback: (err:Error|undefined)=>void): void
    read( callback: (err:Error|undefined, data:Buffer)=>void): void
    write(data:Buffer, withoutResponse:boolean,callback?: (err:Error|undefined)=>void): void
}

export type BleDeviceProps = {
    id?: string;
    address?: string;
    name?: string;
    services?: string[];
    peripheral?: BlePeripheral;
   
}

export type BleCommsConnectProps = {
    timeout?: number;
    reconnect?: boolean;
}


export interface BleWriteProps {
    withoutResponse?: boolean;
    timeout?: number
}


export interface BlePeripheralIdentifier  {
    id?: string;
    address?: string;
    name?: string;
}

export interface BlePeripheralDescription extends BlePeripheralIdentifier{
    profile: string;
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



