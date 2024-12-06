import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";
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
