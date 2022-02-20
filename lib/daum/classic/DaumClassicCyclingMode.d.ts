import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest } from "../../CyclingMode";
import SmartTrainerCyclingMode from "../SmartTrainerCyclingMode";
import DaumAdapter from "../DaumAdapter";
export default class DaumClassicCyclingMode extends SmartTrainerCyclingMode implements CyclingMode {
    constructor(adapter: DaumAdapter, props?: Settings);
    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    getBikeInitRequest(): UpdateRequest;
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(data: IncyclistBikeData): IncyclistBikeData;
}
