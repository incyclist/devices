export declare const INTERFACE: {
    SERIAL: string;
    ANT: string;
    BLE: string;
    BLUETOOTH: string;
    TCPIP: string;
    SIMULATOR: string;
};
declare type DeviceFoundCallback = (device: any, protocol: DeviceProtocol) => void;
declare type ScanFinishedCallback = (id: number) => void;
export declare type ScanProps = {
    id: number;
    onDeviceFound?: DeviceFoundCallback;
    onScanFinished?: ScanFinishedCallback;
};
export default class DeviceProtocol {
    devices: Array<any>;
    constructor();
    getName(): void;
    getInterfaces(): void;
    isBike(): void;
    isHrm(): void;
    isPower(): void;
    scan(props: ScanProps): void;
    stopScan(): void;
    isScanning(): void;
    getDevices(): any[];
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
export {};
