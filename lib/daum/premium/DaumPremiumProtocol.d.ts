import DeviceProtocolBase, { DeviceProtocol, DeviceSettings } from '../../DeviceProtocol';
import { EventLogger } from 'gd-eventlog';
export interface DaumPremiumProtocolState {
    activeScans: Array<any>;
    scanning: boolean;
    stopScanning?: boolean;
}
interface DaumPremiumSettings extends DeviceSettings {
    interface: string;
}
interface DaumPremiumTCPSettings extends DaumPremiumSettings {
    host: string;
}
export default class DaumPremiumProtocol extends DeviceProtocolBase implements DeviceProtocol {
    state: DaumPremiumProtocolState;
    logger: EventLogger;
    constructor();
    add(settings: DaumPremiumSettings | DaumPremiumTCPSettings): any;
    getName(): string;
    getInterfaces(): string[];
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    scan(props: any): void;
    addDevice(DeviceClass: any, opts: any, portName: any): any;
    scanTcpip(opts: any): void;
    scanSerial(opts: any): void;
    isScanning(): boolean;
    stopScan(): Promise<boolean>;
    scanCommand(device: any, opts: any): void;
}
export {};
