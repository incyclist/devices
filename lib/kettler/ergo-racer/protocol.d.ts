/// <reference types="node" />
import DeviceProtocolBase, { DeviceProtocol, DeviceSettings, ScanProps } from '../../DeviceProtocol';
import KettlerRacerAdapter from './adapter';
export interface KettlerRacerScanProps extends ScanProps {
    port: string;
}
declare enum ScanState {
    IDLE = 0,
    SCANNING = 1,
    STOPPING = 2,
    STOPPED = 3
}
export interface ScanDescription {
    device: KettlerRacerAdapter;
    port: string;
    iv: NodeJS.Timeout;
    state: ScanState;
    props: KettlerRacerScanProps;
}
export default class KettlerRacerProtocol extends DeviceProtocolBase implements DeviceProtocol {
    private state;
    private logger;
    private activeScans;
    constructor();
    getSerialPort(): any;
    getInterfaces(): string[];
    getName(): string;
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    add(settings: DeviceSettings): any;
    scan(props: KettlerRacerScanProps): void;
    checkDevice(port: string): boolean;
    doScan(port: string): Promise<void>;
    doStopScan(job: ScanDescription): Promise<void>;
    isJobStopped(job: ScanDescription): boolean;
    waitForStop(timeout?: number): Promise<boolean>;
    stopScan(): Promise<boolean>;
    isScanning(): boolean;
}
export {};
