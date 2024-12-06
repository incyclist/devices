import { Characteristic } from '../base';
import { TValue } from '../types';
interface TCyclingPowerMeasurement extends TValue {
    watts?: number;
    rev_count?: number;
    wheel_count?: number;
    heart_rate?: number;
    spd_int?: number;
    cad_time?: number;
    cadence?: number;
    powerMeterSpeed: number;
    wheel_time?: number;
}
export declare class CyclingPowerMeasurementCharacteristic extends Characteristic<TCyclingPowerMeasurement> {
    constructor();
    update(event: TCyclingPowerMeasurement): void;
}
export {};
