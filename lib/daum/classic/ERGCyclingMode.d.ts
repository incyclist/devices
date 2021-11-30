import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest } from "../../CyclingMode";
import DaumClassicAdapter from "./DaumClassicAdapter";
export default class ERGCyclingMode implements CyclingMode {
    adapter: DaumClassicAdapter;
    logger: EventLogger;
    prevData: IncyclistBikeData;
    prevRequest: UpdateRequest;
    prevUpdateTS: number;
    hasBikeUpdate: boolean;
    settings: Settings;
    constructor(adapter: DaumClassicAdapter, props?: Settings);
    setAdapter(adapter: DaumClassicAdapter): void;
    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    setSetting(name: string, value: any): void;
    getSetting(name: string): any;
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(data: IncyclistBikeData): IncyclistBikeData;
    caclulateTargetPower(request: any, updateMode?: boolean): any;
}
