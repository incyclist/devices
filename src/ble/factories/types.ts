import { DeviceProperties } from "../../types";
import BleAdapter from "../base/adapter";
import { TBleSensor } from "../base/sensor";
import { BleDeviceData } from "../base/types";
import { BleDeviceSettings, BleProtocol } from "../types";

export interface TBleAdapterFactory<T extends TBleSensor> {
    createInstance(settings:BleDeviceSettings,props?:DeviceProperties):BleAdapter<BleDeviceData,T>
    removeInstance( query:{settings?:BleDeviceSettings, adapter?:BleAdapter<BleDeviceData,T>}):void
    getProtocol(services:string[]):BleProtocol
}
export interface BleAdapterInfo<T extends TBleSensor> {
    protocol: BleProtocol;
    Adapter: typeof BleAdapter<BleDeviceData, T>;
    Sensor: typeof TBleSensor;
}
