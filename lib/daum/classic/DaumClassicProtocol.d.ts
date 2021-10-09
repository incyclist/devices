import DeviceProtocolBase, { ScanProps, DeviceProtocol, DeviceSettings } from '../../DeviceProtocol';
import Adapter from './DaumClassicAdapter';
import { EventLogger } from 'gd-eventlog';
export interface DaumClassicProtocolState {
    activeScans: Array<any>;
    scanning: boolean;
    stopScanning?: boolean;
}
export interface DaumClassicScanProps extends ScanProps {
    port: string;
}
export default class DaumClassicProtocol extends DeviceProtocolBase implements DeviceProtocol {
    logger: EventLogger;
    state: DaumClassicProtocolState;
    constructor();
    add(settings: DeviceSettings): Adapter;
    getName(): string;
    getInterfaces(): Array<string>;
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    scan(props: DaumClassicScanProps): void;
    addDevice(opts: any, portName: any): any;
    stopScan(): Promise<boolean>;
    isScanning(): boolean;
    scanCommand(device: any, opts: any): any;
}
