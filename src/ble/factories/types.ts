import { DeviceProperties } from "../../types/index.js";
import BleAdapter from "../base/adapter.js";
import { TBleSensor } from "../base/sensor.js";
import { BleDeviceData } from "../base/types.js";
import { BleDeviceSettings, BleProtocol } from "../types.js";

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
