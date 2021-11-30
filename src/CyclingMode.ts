import {DeviceAdapter} from "./Device"

export type UpdateRequest = {
    slope?: number;
    minPower?: number;
    maxPower?: number;
    targetPower?: number;
    reset?: boolean;
    refresh?: boolean;
}
export enum CyclingModeProperyType {
    Integer,
    Boolean,
    Float,
    String,
    SingleSelect,
    MultiSelect,
}

export type CyclingModeProperty = {
    key: string;
    name: string;
    description: string;
    type: CyclingModeProperyType;
    min?: number;
    max?: number;
    default?: any;
    options?: any[];
}

export type IncyclistBikeData = {
    isPedalling: boolean;
    power: number;
    pedalRpm: number;
    speed: number;
    heartrate:number;
    distance:number;
    distanceInternal:number;
    time?:number;
    gear?:number;
    slope?:number;
}

export type Settings = {
    [key:string]: any;
}


export default interface CyclingMode {

    getName(): string;
    getDescription(): string;
    sendBikeUpdate(request:UpdateRequest): UpdateRequest;
    updateData( data:IncyclistBikeData ): void;

    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;

    setSetting(name: string, value: any):void;
    getSetting(name:string):any;

}