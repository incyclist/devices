import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeBase, CyclingModeProperty, IncyclistBikeData, UpdateRequest } from "../CyclingMode";
import DaumAdapter from "./DaumAdapter";
export declare type ERGEvent = {
    rpmUpdated?: boolean;
    gearUpdated?: boolean;
    starting?: boolean;
    tsStart?: number;
};
export default class ERGCyclingMode extends CyclingModeBase implements CyclingMode {
    logger: EventLogger;
    data: IncyclistBikeData;
    prevRequest: UpdateRequest;
    prevUpdateTS: number;
    hasBikeUpdate: boolean;
    chain: number[];
    cassette: number[];
    event: ERGEvent;
    constructor(adapter: DaumAdapter, props?: any);
    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    getBikeInitRequest(): UpdateRequest;
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(bikeData: IncyclistBikeData): any;
    calculateTargetPower(request: any, updateMode?: boolean): any;
}
