import { Characteristic } from "./base";
import { TValue } from "./types";
export declare class StaticReadCharacteristic extends Characteristic<TValue> {
    description: string;
    constructor(uuid: any, description: any, value: any);
}
