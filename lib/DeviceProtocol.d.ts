import { User } from "./types/user";
export declare const INTERFACE: {
    SERIAL: string;
    ANT: string;
    BLE: string;
    BLUETOOTH: string;
    TCPIP: string;
    SIMULATOR: string;
};
export declare type Device = {
    getID(): string;
    getName(): string;
    getPort(): string;
    getProtocol(): DeviceProtocol;
    getProtocolName(): string;
};
export interface DeviceSettings {
    name: string;
    port: string;
    userSettings?: User;
    bikeSettings?: any;
}
export declare type DeviceFoundCallback = (device: Device, protocol: DeviceProtocol) => void;
export declare type ScanFinishedCallback = (id: number) => void;
export declare type ScanProps = {
    id: number;
    onDeviceFound?: DeviceFoundCallback;
    onScanFinished?: ScanFinishedCallback;
};
export interface DeviceProtocol {
    add(props: DeviceSettings): any;
    getName(): string;
    getInterfaces(): Array<string>;
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    scan(props: ScanProps): void;
    stopScan(): void;
    isScanning(): boolean;
    getDevices(): Array<any>;
    setAnt(antClass: any): void;
    getAnt(): any;
    setSerialPort(serialClass: any): void;
    getSerialPort(): any;
    setNetImpl(netClass: any): void;
    getNetImpl(): any;
}
export default class DeviceProtocolBase {
    devices: Array<Device>;
    constructor();
    getName(): string;
    getInterfaces(): Array<string>;
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    scan(props: ScanProps): void;
    stopScan(): void;
    isScanning(): boolean;
    getDevices(): Array<Device>;
    setAnt(antClass: any): void;
    getAnt(): any;
    setSerialPort(serialClass: any): void;
    getSerialPort(): void;
    setNetImpl(netClass: any): void;
    getNetImpl(): any;
    static setAnt(antClass: any): void;
    static getAnt(): any;
    static setSerialPort(serialClass: any): void;
    static getSerialPort(): any;
    static setNetImpl(netClass: any): void;
    static getNetImpl(): any;
}
