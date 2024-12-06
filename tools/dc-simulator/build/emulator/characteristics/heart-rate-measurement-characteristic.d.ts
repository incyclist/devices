import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";
export interface HeartRateMeasurement extends TValue {
    heart_rate: number;
}
export declare class HeartRateMeasurementCharacteristic extends Characteristic<HeartRateMeasurement> {
    constructor();
    update(event: any): void;
}
