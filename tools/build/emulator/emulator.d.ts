import { EventEmitter } from 'events';
import CyclingPowerService from './services/csp';
import { Service } from './base';
import { FitnessMachineService } from './services/ftms';
import { HeartRateService } from './services/hrs';
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
export {};
