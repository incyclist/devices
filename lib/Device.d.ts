import { DeviceProtocol, Device } from './DeviceProtocol';
import CyclingMode from './CyclingMode';
export declare type OnDeviceDataCallback = (data: any) => void;
export interface Bike {
    setCyclingMode(mode: CyclingMode | string, settings?: any): void;
    getSupportedCyclingModes(): Array<any>;
    getCyclingMode(): CyclingMode;
    getDefaultCyclingMode(): CyclingMode;
    setUserSettings(userSettings: any): void;
    setBikeSettings(bikeSettings: any): void;
}
export interface DeviceAdapter extends Device {
    isBike(): boolean;
    isPower(): boolean;
    isHrm(): boolean;
    getID(): string;
    getDisplayName(): string;
    getName(): string;
    getPort(): string;
    getProtocol(): DeviceProtocol;
    getProtocolName(): string;
    setIgnoreHrm(ignore: boolean): void;
    setIgnorePower(ignore: boolean): void;
    setIgnoreBike(ignore: boolean): void;
    select(): void;
    unselect(): void;
    isSelected(): boolean;
    setDetected(detected?: boolean): void;
    isDetected(): boolean;
    start(props?: any): Promise<any>;
    stop(): Promise<boolean>;
    pause(): Promise<boolean>;
    resume(): Promise<boolean>;
    sendUpdate(request: any): void;
    onData(callback: OnDeviceDataCallback): void;
}
export default class DeviceAdapterBase implements DeviceAdapter {
    protocol: DeviceProtocol;
    detected: boolean;
    selected: boolean;
    onDataFn: OnDeviceDataCallback;
    constructor(proto: DeviceProtocol);
    isBike(): boolean;
    isPower(): boolean;
    isHrm(): boolean;
    getID(): string;
    getDisplayName(): string;
    getName(): string;
    getPort(): string;
    getProtocol(): DeviceProtocol;
    getProtocolName(): string | undefined;
    setIgnoreHrm(ignore: any): void;
    setIgnorePower(ignore: any): void;
    setIgnoreBike(ignore: any): void;
    select(): void;
    unselect(): void;
    isSelected(): boolean;
    setDetected(detected?: boolean): void;
    isDetected(): boolean;
    update(): void;
    check(): void;
    connect(): void;
    close(): void;
    start(props?: any): Promise<any>;
    stop(): Promise<boolean>;
    pause(): Promise<boolean>;
    resume(): Promise<boolean>;
    sendUpdate(request: any): void;
    onData(callback: OnDeviceDataCallback): void;
}
