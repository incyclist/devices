import { Device } from "./DeviceProtocol";
export declare type UpdateRequest = {
    slope?: number;
    minPower?: number;
    maxPower?: number;
    targetPower?: number;
    reset?: boolean;
    refresh?: boolean;
};
export declare enum CyclingModeProperyType {
    Integer = "Integer",
    Boolean = "Boolean",
    Float = "Float",
    String = "String",
    SingleSelect = "SingleSelect",
    MultiSelect = "MultiSelect"
}
export declare type CyclingModeProperty = {
    key: string;
    name: string;
    description: string;
    type: CyclingModeProperyType;
    min?: number;
    max?: number;
    default?: any;
    options?: any[];
};
export declare type IncyclistBikeData = {
    isPedalling: boolean;
    power: number;
    pedalRpm: number;
    speed: number;
    heartrate: number;
    distance: number;
    distanceInternal: number;
    time?: number;
    gear?: number;
    slope?: number;
};
export declare type Settings = {
    [key: string]: any;
};
export default interface CyclingMode {
    getName(): string;
    getDescription(): string;
    getBikeInitRequest(): UpdateRequest;
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(data: IncyclistBikeData): IncyclistBikeData;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    setSettings(settings: any): any;
    setSetting(name: string, value: any): void;
    getSetting(name: string): any;
    getSettings(): Settings;
}
export declare class CyclingModeBase implements CyclingMode {
    adapter: Device;
    settings: Settings;
    constructor(adapter: Device, props?: any);
    setAdapter(adapter: Device): void;
    getBikeInitRequest(): UpdateRequest;
    getName(): string;
    getDescription(): string;
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(data: IncyclistBikeData): IncyclistBikeData;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    setSettings(settings?: any): void;
    setSetting(name: string, value: any): void;
    getSetting(name: string): any;
    getSettings(): Settings;
}