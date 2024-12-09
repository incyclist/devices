import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";
type Handler = (_data: Buffer) => number;
export declare class FitnessMachineControlPointCharacteristic extends Characteristic<TValue> {
    protected hasControl: boolean;
    protected isStarted: boolean;
    protected targetPower: number;
    protected handlers: Record<number, Handler>;
    constructor();
    handleRequestControl(): number;
    handleReset(): number;
    handleSetTargetPower(data: Buffer): number;
    handleStartOrResume(): number;
    handleStopOrPause(): number;
    handleSetIndoorBikeSimulation(data: Buffer): number;
    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (success: boolean, response?: Buffer) => void): void;
}
export {};
