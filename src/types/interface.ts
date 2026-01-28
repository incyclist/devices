import EventEmitter from "node:events";
import { EventLogger } from "gd-eventlog";
import { IncyclistScanProps, DeviceSettings } from "./device.js";


export type InterfaceProps = {
    binding?: any, 
    logger?:EventLogger,
    log?:boolean
    enabled?:boolean
}


export interface IncyclistInterface extends EventEmitter{
    getName(): string;
    setBinding(binding: any): void;
    connect(): Promise<boolean>;
    disconnect(): Promise<boolean>;
    isConnected(): boolean;
    scan(props: IncyclistScanProps): Promise<DeviceSettings[]>;
    stopScan(): Promise<boolean>
    addKnownDevice?(settings: DeviceSettings): void 

}
