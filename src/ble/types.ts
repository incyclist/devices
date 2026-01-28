import EventEmitter from "events";
import { EventLogger } from "gd-eventlog";
import { DeviceProperties, DeviceSettings, DeviceStartProperties, IncyclistInterface, IncyclistScanProps,InterfaceProps } from "../types/index.js";


export type BleProtocol = 'hr' | 'fm' | 'cp' | 'tacx' | 'wahoo' | 'elite' | 'csc' | 'zwift-play'
export type BleInterfaceState  =  'unknown' | 'resetting' | 'unsupported' | 'unauthorized' | 'poweredOff'|  'poweredOn'


export interface BleBinding extends EventEmitter {
    startScanning(serviceUUIDs?: string[], allowDuplicates?: boolean, callback?: (error?: Error) => void): void;
    stopScanning(callback?: () => void): void;
//    open(): {err: Error, opened: boolean}
    pauseLogging()
    resumeLogging()
    setServerDebug(enabled:boolean)
    _bindings: any;
    state: BleInterfaceState;
    on(eventName: string | symbol, listener: (...args: any[]) => void):this
}


/** 
 * Advertisement as provided by the binding (Noble library)
 **/

export interface BleRawAdvertisement  {
    address?: string
    localName?:string
    serviceUuids?:string[]
    rssi?: number,
}



/** 
 * Peripheral as provided by the binding (Noble library)
 * this will be used as interface to communicate with the device
 **/
export interface BleRawPeripheral extends EventEmitter{
    id?: string;
    address?: string;
    name?: string;
    services: any[];
    advertisement: any;
    state: string

    connectAsync(): Promise<void>;
    disconnectAsync(): Promise<void>;

    disconnect( cb:(err?:Error)=>void ): Promise<void>;
    discoverSomeServicesAndCharacteristicsAsync(serviceUUIDs: string[], characteristicUUIDs: string[]): Promise<DiscoverResult>;
    discoverServicesAsync?(serviceUUIDs: string[]): Promise<BleService[]>;
}


export interface PeripheralAnnouncement {
    name        : string
    serviceUUIDs: string[]
    transport:    string  
}

export interface BlePeripheralAnnouncement extends PeripheralAnnouncement { 
    advertisement: any;
    manufacturerData?: Buffer;
    peripheral: BleRawPeripheral
}

export interface BlePeripheralInfo {
    id: string;
    uuid: string
    address: string;
    addressType: string;
    advertisement: any;
    rssi: number;
    serviceUUIDs: string[]
    stats: string
}



export interface BleScanProps extends IncyclistScanProps{
    protocol?: BleProtocol
    protocols?: BleProtocol[]    
    isBackgroundScan?: boolean    
}



export interface BleDeviceConstructProps extends BlePeripheralAnnouncement {
    log?: boolean;
    logger?: EventLogger;    
}

export interface BleDeviceIdentifier { 
    id?: string;
    address?: string;    
    name?: string;
}

export interface BleDeviceSettings extends DeviceSettings {
    id?: string;
    protocol: BleProtocol;
    profile?:string; // Legacy
    address?: string;    
    name?: string;
    services?: string
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



export type DiscoverResult = {
    services: BleService[]
    characteristics: BleRawCharacteristic[]
}



export type BleProperty = 'notify' | 'read' | 'write' | 'indicate'

export interface BleCharacteristic  {
    uuid: string;
    properties: BleProperty[];
    name?: string
    _serviceUuid?: string
}

export interface BleRawCharacteristic extends BleCharacteristic, EventEmitter {
    subscribe( callback: (err:Error|undefined)=>void): void
    unsubscribe( callback: (err:Error|undefined)=>void): void
    read( callback: (err:Error|undefined, data:Buffer)=>void): void
    write(data:Buffer, withoutResponse:boolean,callback?: (err:Error|undefined)=>void): void
}


export type BleService = {
    uuid: string;
    characteristics?: BleCharacteristic[]
}


export type BleCommsConnectProps = {
    timeout?: number;
    reconnect?: boolean;
}


export interface BleWriteProps {
    withoutResponse?: boolean;
    timeout?: number
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
export interface IBleInterface<T extends PeripheralAnnouncement> extends IncyclistInterface {
    pauseLogging(debugOnly?: boolean): void;
    resumeLogging();
    isLoggingPaused():boolean
    logEvent(event);
    logError(err: Error, fn: string, args?);

    createPeripheral(announcement: T):IBlePeripheral
    createPeripheralFromSettings(settings:DeviceSettings):IBlePeripheral
    createDeviceSetting(announcement: T):DeviceSettings
    waitForPeripheral(settings:DeviceSettings): Promise<IBlePeripheral>
    pauseDiscovery?():Promise<void>
    resumeDiscovery?():Promise<void>
}


export interface IBlePeripheral {
    services: BleService[];

    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;

    isConnected():boolean
    isConnecting():boolean

    onDisconnect( callback:()=>void):void

    discoverServices(): Promise<string[]>;
    discoverCharacteristics(serviceUUID: string): Promise<BleCharacteristic[]>;

    subscribe(characteristicUUID: string, callback: (characteristicUuid: string, data:Buffer) => void): Promise<boolean>;
    unsubscribe(characteristicUUID: string): Promise<boolean>;
    subscribeAll?(callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean>
    subscribeSelected(characteristics:string[], callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean>

    read(characteristicUUID: string): Promise<Buffer>;
    write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer>;

    getManufacturerData?():Buffer
    getInfo():BleDeviceIdentifier
    getAnnouncedServices(): string[]
    getDiscoveredServices(): string[]

}

export interface IBleSensor extends EventEmitter  {
    startSensor(): Promise<boolean>;
    stopSensor(): Promise<boolean>;

    reset():void
    isConnected():boolean
    read(characteristicUUID: string): Promise<Buffer>;
    write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer>;
}

