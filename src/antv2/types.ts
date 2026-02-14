import type { Profile } from 'incyclist-ant-plus';
import {IAdapter, DeviceProperties, DeviceSettings, IncyclistScanProps, InterfaceProps} from '../types/index.js'
import AntAdapter from './base/adapter.js';

export interface AntDeviceSettings extends DeviceSettings {
    deviceID?: string;
    profile: Profile | LegacyProfile; 
    interface: string
    protocol?:string // legacy @deprecated
}

export type LegacyProfile = 'Heartrate Monitor' | 'Power Meter' | 'Smart Trainer' | 'Speed Sensor' | 'Cadence Sensor' | 'Speed + Cadence Sensor' | 'Controller'


export const isLegacyProfile = (o:unknown):boolean => o==='Heartrate Monitor' || o==='Power Meter' || o==='Smart Trainer' || o==='Speed Sensor' || o==='Cadence Sensor' || o==='Speed + Cadence Sensor'

export type DeviceFoundCallback = (device:IAdapter, protocol: string) => void
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
export type BaseDeviceData = {
    DeviceID: number;
    ManId?: number;
};
export type AntAdapterInfo = {
    antProfile: Profile;
    incyclistProfile: LegacyProfile;
    Adapter: typeof AntAdapter<BaseDeviceData>;
};

export type AdapterQuery = {
    antProfile?: Profile;
    incyclistProfile?: LegacyProfile;
};
export interface AntInterfaceProps extends InterfaceProps {
    startupTimeout?: number;
}

export interface ConnectState {
    connected: boolean;
    connecting: boolean;
}

export interface AdapterStartStatus {
    timeout:boolean,
    sensorStarted: boolean,
    hasData:boolean,
    userInitialized?:boolean
    controlInitialized?:boolean
    interrupted?:boolean
}
