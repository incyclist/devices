export  type IncyclistAdapterData = {
    speed?: number;
    slope?: number;
    power?: number;
    cadence?: number;
    heartrate?: number;
    distance?: number;
    timestamp?: number;

    deviceTime?: number;
    deviceDistanceCounter?: number;
    internalDistanceCounter?: number;
}
export type IncyclistBikeData = {
    isPedalling?: boolean
    power: number
    pedalRpm: number
    speed: number
    heartrate?: number
    distanceInternal?: number // Total Distance in meters 
    time?: number
    gear?: number
    slope?: number
}
