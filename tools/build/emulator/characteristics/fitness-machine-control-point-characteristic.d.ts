import { Characteristic } from "../base";
import { TValue } from "../types";
export declare class FitnessMachineControlPointCharacteristic extends Characteristic<TValue> {
    protected hasControl: boolean;
    protected isStarted: boolean;
    protected targetPower: number;
    constructor();
    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (success: boolean, response?: Buffer) => void): void;
}
