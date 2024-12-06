import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";
interface CyclingPowerWahoo extends TValue {
    targetPower: number;
}
export declare class CyclingPowerWahooCharacteristicExtension extends Characteristic<CyclingPowerWahoo> {
    constructor();
    update(value: CyclingPowerWahoo): void;
    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (result: boolean) => void): void;
}
export {};
