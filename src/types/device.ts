import { EventLogger } from "gd-eventlog"
import { IncyclistInterface } from "./interface.js"
import { User } from "./user.js"
import { IncyclistCapability } from "./capabilities.js"

export enum INTERFACE  {
    SERIAL= 'serial',
    TCPIP= 'tcpip',
    ANT= 'ant',
    BLE= 'ble',
    USB= 'usb',
    SIMULATOR= 'simulator',
    DC = 'wifi'
}

export type DeviceType = 'race' | 'mountain' | 'triathlon'


export type DeviceProperties = {
    user?:User
    userWeight?: number;
    bikeWeight?: number;
    capabilities?: IncyclistCapability[];
}

export interface DeviceStartProperties extends DeviceProperties {
    timeout?: number
}

export type IncyclistScanProps = {
    timeout?: number,
    logger?:EventLogger
}

export type DeviceSettings = {
    interface: string | IncyclistInterface
    name?: string
}

