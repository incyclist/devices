import { DeviceSettings } from "../../DeviceProtocol";
import DeviceAdapterBase, { DeviceAdapter, DeviceData, Bike } from "../../Device";
import { DeviceProtocol } from "../../DeviceProtocol";
import { EventLogger } from "gd-eventlog";
import SerialComms from "../comms";
import { Command } from "../../types/command";
import CyclingMode, { IncyclistBikeData } from "../../CyclingMode";
import { User } from "../../types/user";
export interface KettlerRacerCommand extends Command {
}
export interface KettlerExtendedBikeData {
}
export interface KettlerBikeData {
    heartrate?: number;
    cadence?: number;
    speed?: number;
    distance?: number;
    requestedPower?: number;
    energy?: number;
    timestamp?: number;
    time: number;
    power: number;
}
export interface KettlerDeviceSettings extends DeviceSettings {
    userSettings?: User;
    bikeSettings?: any;
    cyclingMode?: CyclingMode;
}
export default class KettlerRacerAdapter extends DeviceAdapterBase implements DeviceAdapter, Bike {
    private id;
    private settings;
    private ignoreHrm;
    private ignoreBike;
    private ignorePower;
    private logger;
    private paused;
    private iv;
    private requests;
    private data;
    private idata;
    private kettlerData;
    private updateBusy;
    private requestBusy;
    private comms;
    constructor(protocol: DeviceProtocol, settings: DeviceSettings);
    isBike(): boolean;
    isPower(): boolean;
    isHrm(): boolean;
    setID(id: any): void;
    getID(): string;
    getName(): string;
    getPort(): string;
    setIgnoreHrm(ignore: boolean): void;
    setIgnorePower(ignore: boolean): void;
    setIgnoreBike(ignore: boolean): void;
    _getComms(): SerialComms<KettlerRacerCommand>;
    _setComms(comms: SerialComms<KettlerRacerCommand>): void;
    getLogger(): EventLogger;
    getUserSettings(): User;
    getWeight(): number;
    setComputerMode(): Promise<boolean>;
    setClientMode(): Promise<boolean>;
    reset(): Promise<boolean>;
    getIdentifier(): Promise<string>;
    getInterface(): Promise<string>;
    getVersion(): Promise<string>;
    getCalibration(): Promise<string>;
    startTraining(): Promise<string>;
    unknownSN(): Promise<string>;
    setBaudrate(baudrate: number): Promise<string>;
    setPower(power: number): Promise<KettlerBikeData>;
    getExtendedStatus(): Promise<KettlerExtendedBikeData>;
    getStatus(): Promise<KettlerBikeData>;
    getDB(): Promise<string>;
    send(logStr: string, message: string, timeout?: any): Promise<any>;
    parseExtendedStatus(data: string): KettlerExtendedBikeData;
    parseStatus(data: string): KettlerBikeData;
    check(): Promise<boolean>;
    start(props?: any): Promise<any>;
    startUpdatePull(): void;
    stop(): Promise<boolean>;
    pause(): Promise<boolean>;
    resume(): Promise<boolean>;
    mapData(bikeData: KettlerBikeData): IncyclistBikeData;
    transformData(internalData: IncyclistBikeData, bikeData: KettlerBikeData): DeviceData;
    update(): Promise<void>;
    sendRequest(request: any): Promise<any>;
    sendRequests(): Promise<void>;
    bikeSync(): Promise<void>;
    sendUpdate(request: any): Promise<unknown>;
    sendData(): void;
    refreshRequests(): void;
    processClientRequest(request: any): Promise<unknown>;
    waitForOpened(): Promise<boolean>;
    waitForClosed(): Promise<boolean>;
    getSupportedCyclingModes(): any[];
    setCyclingMode(mode: CyclingMode | string, settings?: any): void;
    getCyclingMode(): CyclingMode;
    getDefaultCyclingMode(): CyclingMode;
    setUserSettings(userSettings: any): void;
    setBikeSettings(bikeSettings: any): void;
}
