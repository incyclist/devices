import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest } from "../../CyclingMode";
import DaumAdapter from "../DaumAdapter";
import PowerMeterCyclingMode from "../PowerMeterCyclingMode";
export default class DaumClassicCyclingMode extends PowerMeterCyclingMode implements CyclingMode {
    constructor(adapter: DaumAdapter, props?: Settings);
    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    getBikeInitRequest(): UpdateRequest;
    getSettings(): Settings;
    getSetting(name: string): any;
    updateData(data: IncyclistBikeData): IncyclistBikeData;
}
