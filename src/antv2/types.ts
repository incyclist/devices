import { Profile } from 'incyclist-ant-plus';
import IncyclistDevice from '../base/adpater';
import {DeviceProperties, DeviceSettings, IncyclistScanProps} from '../types/device'

export interface AntDeviceSettings extends DeviceSettings {
    deviceID?: string;
    profile: Profile | LegacyProfile; 
    protocol?:string // legacy @deprecated
}

export type LegacyProfile = 'Heartrate Monitor' | 'Power Meter' | 'Smart Trainer' | 'Speed Sensor' | 'Cadence Sensor' | 'Speed + Cadence Sensor'

export type DeviceFoundCallback = (device:IncyclistDevice, protocol: string) => void
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


