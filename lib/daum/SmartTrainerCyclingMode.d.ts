import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest } from "../CyclingMode";
import DaumAdapter from "./DaumAdapter";
export default class SmartTrainerCyclingMode implements CyclingMode {
    adapter: DaumAdapter;
    logger: EventLogger;
    prevData: IncyclistBikeData;
    prevRequest: UpdateRequest;
    prevUpdateTS: number;
    hasBikeUpdate: boolean;
    settings: Settings;
    constructor(adapter: DaumAdapter, props?: Settings);
    setAdapter(adapter: DaumAdapter): void;
    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    setSetting(name: string, value: any): void;
    getSetting(name: string): any;
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(data: IncyclistBikeData): IncyclistBikeData;
    calculateTargetPower(request: any, updateMode?: boolean): any;
}
