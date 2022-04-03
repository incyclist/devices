import { EventLogger } from 'gd-eventlog';
import CyclingMode, { CyclingModeProperty, IncyclistBikeData, Settings, UpdateRequest, CyclingModeBase } from '../../../CyclingMode';
import KettlerRacerAdapter from '../adapter';
export default class PowerMeterCyclingMode extends CyclingModeBase implements CyclingMode {
    logger: EventLogger;
    data: IncyclistBikeData;
    prevRequest: UpdateRequest;
    prevUpdateTS: number;
    hasBikeUpdate: boolean;
    constructor(adapter: KettlerRacerAdapter, props?: Settings);
    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    getBikeInitRequest(): UpdateRequest;
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(data: IncyclistBikeData): IncyclistBikeData;
}
