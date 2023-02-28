import EventEmitter from "events";
import { EventLogger } from "gd-eventlog";
import { IncyclistScanProps, DeviceSettings } from "./device";


export type InterfaceProps = {
    binding?: any, 
    logger?:EventLogger,
    log?:boolean
}


export interface IncyclistInterface extends EventEmitter{
    getName(): string;
    setBinding(binding: any): void;
    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;
    scan(props: IncyclistScanProps): Promise<DeviceSettings[]>;
    stopScan(): Promise<boolean>
}
