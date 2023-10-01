import { EventLogger } from "gd-eventlog"
import { IncyclistInterface } from "./interface"
import { User } from "./user"

export const INTERFACE = {
    SERIAL: 'serial',
    TCPIP: 'tcpip',
    ANT: 'ant',
    BLE: 'ble',
    USB: 'usb',
    SIMULATOR: 'simulator'
}

export type DeviceType = 'race' | 'mountain' | 'triathlon'

export type Device = {
    getID(): string
    getName(): string
    getInterface(): string
}

export type DaumBikeData = {
    cadence: number
    speed: number
    power:number
    heartrate:number
    distanceInternal:number
    gear:number
    time:number
    slope?: number
}

export type DeviceProperties = {
    user?:User
    userWeight?: number;
    bikeWeight?: number
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


