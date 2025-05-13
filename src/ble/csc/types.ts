import { BleDeviceData } from "../base/types";

export interface CSCData extends BleDeviceData  {
    speed?: number,     // m/s
    cadence?: number,
    raw?: string;
}