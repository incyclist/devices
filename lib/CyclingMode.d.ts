export declare type UpdateRequest = {
    slope?: number;
    minPower?: number;
    maxPower?: number;
    targetPower?: number;
    reset?: boolean;
    refresh?: boolean;
};
export declare enum CyclingModeProperyType {
    Integer = 0,
    Boolean = 1,
    Float = 2,
    String = 3,
    SingleSelect = 4,
    MultiSelect = 5
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
    sendBikeUpdate(request: UpdateRequest): UpdateRequest;
    updateData(data: IncyclistBikeData): void;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;
    setSetting(name: string, value: any): void;
    getSetting(name: string): any;
}
