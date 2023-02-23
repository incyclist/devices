import { EventLogger } from "gd-eventlog";
import { IncyclistScanProps, DeviceSettings } from "./device";


export type InterfaceProps = {
    binding?: any, 
    logger?:EventLogger,
    log?:boolean
}


export type IncyclistInterface ={
    getName(): string;
    setBinding(binding: any): void;
    connect(): Promise<boolean>;
    disconnect(): Promise<Boolean>;
    scan(props: IncyclistScanProps): Promise<DeviceSettings[]>;
}
