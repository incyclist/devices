import DeviceProtocolBase from '../../DeviceProtocol';
import { EventLogger } from 'gd-eventlog';
export interface DaumPremiumProtocolState {
    activeScans: Array<any>;
    scanning: boolean;
    stopScanning?: boolean;
}
export default class DaumPremiumProtocol extends DeviceProtocolBase {
    state: DaumPremiumProtocolState;
    logger: EventLogger;
    constructor();
    getName(): string;
    getInterfaces(): string[];
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    scan(props: any): void;
    addDevice(DeviceClass: any, opts: any, portName: any): any;
    scanTcpip(opts: any): void;
    scanSerial(opts: any): void;
    stopScan(): Promise<boolean>;
    scanCommand(device: any, opts: any): void;
}
