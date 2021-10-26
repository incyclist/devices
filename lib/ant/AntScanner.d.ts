import { EventLogger } from "gd-eventlog";
import DeviceProtocolBase, { DeviceProtocol, DeviceSettings } from "../DeviceProtocol";
import AntAdapter from "./AntAdapter";
declare type ScanState = {
    isScanning: boolean;
    timeout?: number;
    iv?: any;
    stick: any;
};
declare type AntAdapterInfo = {
    name: string;
    Adapter: any;
};
interface AntDeviceSettings extends DeviceSettings {
    deviceID: string;
    profile: string;
}
export declare class AntProtocol extends DeviceProtocolBase implements DeviceProtocol {
    logger: EventLogger;
    ant: any;
    activeScans: Record<string, ScanState>;
    profiles: Array<AntAdapterInfo>;
    sensors: any;
    sticks: Array<any>;
    constructor(antClass: any);
    add(settings: AntDeviceSettings): any;
    getAnt(): any;
    getName(): string;
    getInterfaces(): Array<string>;
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    isScanning(): boolean;
    getSupportedProfiles(): Array<string>;
    getUSBDeviceInfo(d: any): {
        port: string;
        vendor: any;
        product: any;
        inUse: any;
    };
    getStickInfo(sticks: any): any;
    findStickByPort(port: any): any;
    logStickInfo(): void;
    getDetailedStickInfo(stick: any): void;
    getStick(onStart: (stick: any) => void, onError: (reason: string) => void): Promise<any>;
    getFirstStick(): Promise<any>;
    closeStick(stick: any): Promise<unknown>;
    stopScanOnStick(stickInfo: any): Promise<boolean>;
    scanOnStick(stickInfo: any, props?: any): Promise<unknown>;
    scan(props: any): Promise<void>;
    stopScan(): Promise<boolean>;
    waitForStickOpened(): Promise<unknown>;
    attachSensors(d: AntAdapter | Array<AntAdapter>, SensorClass: any, message: any): Promise<unknown>;
    detachSensor(adapter: AntAdapter): Promise<unknown>;
    closeSensor(device: any): Promise<void>;
}
export declare function AntScanner(antClass: any): any;
export {};
