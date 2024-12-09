export * from './characteristics/characteristic.js';
export * from './types.js';
import { EventEmitter } from 'events';
import CyclingPowerService from './services/csp.js';
import { Service } from "./services/service.js";
import { FitnessMachineService } from './services/ftms.js';
import { HeartRateService } from './services/hrs.js';
interface Options {
    name?: string;
    frequency?: number;
    disableCps?: boolean;
}
interface DataUpdate {
    power?: number;
    speed?: number;
    cadence?: number;
    heartrate?: number;
}
export declare class Emulator extends EventEmitter {
    name: string;
    csp: CyclingPowerService;
    ftms: FitnessMachineService;
    hrs: HeartRateService;
    last_timestamp: number;
    rev_count: number;
    power: number;
    speed: number;
    cadence: number;
    heartrate: number;
    frequency: number;
    constructor(options?: Options);
    getServices(): Service[];
    start(): void;
    update(DataUpdate: DataUpdate): void;
}
