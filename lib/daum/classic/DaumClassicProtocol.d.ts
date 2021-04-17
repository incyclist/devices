import DeviceProtocol, { ScanProps } from '../../DeviceProtocol';
import { EventLogger } from 'gd-eventlog';
export interface DaumClassicProtocolState {
    activeScans: Array<any>;
    scanning: boolean;
    stopScanning?: boolean;
}
export interface DaumClassicScanProps extends ScanProps {
    port: string;
}
export default class DaumClassicProtocol extends DeviceProtocol {
    logger: EventLogger;
    state: DaumClassicProtocolState;
    constructor();
    getName(): string;
    getInterfaces(): string[];
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    scan(props: DaumClassicScanProps): void;
    addDevice(opts: any, portName: any): any;
    stopScan(): Promise<boolean>;
    isScanning(): boolean;
    scanCommand(device: any, opts: any): any;
}
