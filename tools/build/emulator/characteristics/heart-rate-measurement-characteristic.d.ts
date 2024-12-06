import { Characteristic } from "../base";
import { TValue } from "../types";
export interface HeartRateMeasurement extends TValue {
    heart_rate: number;
}
export declare class HeartRateMeasurementCharacteristic extends Characteristic<HeartRateMeasurement> {
    constructor();
    update(event: any): void;
}