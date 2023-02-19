import IncyclistDevice from '../base/adpater';
import {DeviceProperties, DeviceSettings, IncyclistScanProps} from '../types/device'

export interface AntDeviceSettings extends DeviceSettings {
    deviceID?: string;
    profile: string;
    protocol?:string // legacy @deprecated
}

export type DeviceFoundCallback = (device:IncyclistDevice, protocol: string) => void
export type ScanFinishedCallback = (id: number) => void


export interface AntScanProps extends IncyclistScanProps {
    profiles?: string []
    id?:number,
    onDeviceFound?: DeviceFoundCallback,
    onScanFinished?: ScanFinishedCallback
}

export interface AntDeviceProperties extends DeviceProperties {
    startupTimeout?: number;
    automaticReconnect?: boolean
}


