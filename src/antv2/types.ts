import { Profile } from 'incyclist-ant-plus';
import IncyclistDevice from '../base/adpater';
import {DeviceProperties, DeviceSettings, IncyclistScanProps} from '../types/device'
import { Controllable } from '../types/adapter';

export interface AntDeviceSettings extends DeviceSettings {
    deviceID?: string;
    profile: Profile | LegacyProfile; 
    protocol?:string // legacy @deprecated
}

export type LegacyProfile = 'Heartrate Monitor' | 'Power Meter' | 'Smart Trainer' | 'Speed Sensor' | 'Cadence Sensor' | 'Speed + Cadence Sensor'
export const isLegacyProfile = (o:unknown):boolean => o==='Heartrate Monitor' || o==='Power Meter' || o==='Smart Trainer' || o==='Speed Sensor' || o==='Cadence Sensor' || o==='Speed + Cadence Sensor'

export type DeviceFoundCallback = (device:IncyclistDevice<Controllable<DeviceProperties>,DeviceProperties>, protocol: string) => void
export type ScanFinishedCallback = (id: number) => void


export interface AntScanProps extends IncyclistScanProps {
    profiles?: Profile []
    id?:number,
    onDeviceFound?: DeviceFoundCallback,
    onScanFinished?: ScanFinishedCallback
}

export interface AntDeviceProperties extends DeviceProperties {
    startupTimeout?: number;
    automaticReconnect?: boolean
}


