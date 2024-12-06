import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";
export declare class StaticReadCharacteristic extends Characteristic<TValue> {
    description: string;
    constructor(uuid: any, description: any, value: any);
}
