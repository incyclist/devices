import DeviceProtocolBase, { DeviceSettings } from '../DeviceProtocol';
import DeviceAdapter from '../Device';
import { EventLogger } from 'gd-eventlog';
export declare class Simulator extends DeviceAdapter {
    static NAME: string;
    logger: EventLogger;
    speed: number;
    power: number;
    cadence: number;
    paused: boolean;
    time: number;
    iv: any;
    started: boolean;
    slope: number;
    limit: any;
    startProps?: any;
    constructor(protocol?: any);
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    getID(): string;
    getName(): string;
    getPort(): string;
    start(props?: any): Promise<unknown>;
    stop(): Promise<boolean>;
    pause(): Promise<boolean>;
    resume(): Promise<boolean>;
    toggle(): Promise<boolean>;
    faster(): void;
    slower(): void;
    update(): void;
    calculateDistance(speedKps: any, timeS: any): number;
    sendUpdate(request: any): any;
}
export default class SimulatorProtocol extends DeviceProtocolBase {
    static NAME: string;
    constructor();
    add(settings: DeviceSettings): void;
    getName(): string;
    getInterfaces(): string[];
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    getDevices(): import("../DeviceProtocol").Device[];
}
