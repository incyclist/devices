import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest, CyclingModeBase } from "../CyclingMode";
import DaumAdapter from "./DaumAdapter";
interface STUpdateRequest extends UpdateRequest {
    calculatedPower?: number;
    delta?: number;
    enforced?: boolean;
    belowMin?: boolean;
    aboveMax?: boolean;
}
export declare enum direction {
    up = "up",
    down = "down"
}
interface STEvent {
    gearUpdate?: direction;
    rpmUpdate?: boolean;
    targetNotReached?: number;
}
export default class SmartTrainerCyclingMode extends CyclingModeBase implements CyclingMode {
    logger: EventLogger;
    data: IncyclistBikeData;
    prevRequest: STUpdateRequest;
    prevUpdateTS: number;
    chain: number[];
    cassette: number[];
    event: STEvent;
    constructor(adapter: DaumAdapter, props?: Settings);
    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    getBikeInitRequest(): STUpdateRequest;
    useGearSimulation(): boolean;
    getMinMaxGears(source: string): [number, number];
    sendBikeUpdate(request: STUpdateRequest): STUpdateRequest;
    updateData(bikeData: IncyclistBikeData): any;
    calculateSpeed(gear: any, rpm: any, slope: any, bikeSpeed: any, props?: any): any;
    calculateTargetPower(request: STUpdateRequest, speed?: number): STUpdateRequest;
}
export {};
