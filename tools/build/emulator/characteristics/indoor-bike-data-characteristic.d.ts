import { Characteristic } from "../base";
import { TValue } from "../types";
interface IndoorBikeData extends TValue {
    watts: number;
    cadence: number;
    heart_rate: number;
}
export declare class IndoorBikeDataCharacteristic extends Characteristic<IndoorBikeData> {
    constructor();
    update(event: IndoorBikeData): void;
}
export {};
