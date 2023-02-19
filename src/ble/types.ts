import { EventEmitter } from "stream";
import { DeviceProperties, DeviceSettings } from "../types/device";

export interface BleDeviceSettings extends DeviceSettings {
    id?: string;
    profile: string;
    protocol: string;
    address?: string;    
}

export interface BleDeviceProperties extends DeviceProperties {
    wheelDiameter?:number, 
    gearRatio?:number
}

export interface BleStartProperties extends BleDeviceProperties {
    restart?:boolean
}

export interface BlePeripheral extends EventEmitter, BlePeripheralIdentifier{
    services: string[];
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

    subscribe( callback: (err:Error)=>void): void
    read( callback: (err:Error, data:Buffer)=>void): void
    write(data:Buffer, withoutResponse:boolean,callback?: (err:Error)=>void): void
}

export type BleDeviceProps = {
    id?: string;
    address?: string;
    name?: string;
    services?: string[];
    peripheral?: BlePeripheral;
   
}

export type ConnectProps = {
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


export abstract class  BleDeviceCommsClass extends EventEmitter { 
    static services: string[] = []
    id?: string;
    address?: string;
    name?: string;
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
    abstract getServices(): string[]

    setCharacteristicUUIDs( uuids: string[]) {}


}

