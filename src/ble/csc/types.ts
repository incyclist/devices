import { BleDeviceData } from "../base/types";

export interface CSCData extends BleDeviceData  {
    speed?: number,
    cadence?: number,
    raw?: string;
}