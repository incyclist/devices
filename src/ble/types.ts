import { EventLogger } from "gd-eventlog";
import { EventEmitter } from "stream";
import { DeviceProperties, DeviceSettings, IncyclistScanProps } from "../types/device";
import { IncyclistInterface, InterfaceProps } from "../types/interface";
import { BleBinding } from "./ble";

export type BleProtocol = 'hr' | 'fm' | 'cp' | 'tacx' | 'wahoo' | 'elite'


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

export interface BleStartProperties extends BleDeviceProperties {
    restart?:boolean
}

export interface BleInterfaceProps extends InterfaceProps {
    binding?: BleBinding
    timeout?: number;
    reconnect?: boolean;
}


export interface BlePeripheral extends EventEmitter, BlePeripheralIdentifier{
    services: [];
    advertisement: any;
    state: string

    connectAsync(): Promise<void>;
    disconnect( cb:(err?:Error)=>void ): Promise<void>;
    discoverSomeServicesAndCharacteristicsAsync(serviceUUIDs: string[], characteristicUUIDs: string[]): Promise<any>;
    

}

export interface IBlePeripheralConnector {
    connect():Promise<void>,
    reconnect():Promise<void> 
    initialize(enforce:boolean):Promise<void>
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
    properties: string[]

    subscribe( callback: (err:Error|undefined)=>void): void
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



