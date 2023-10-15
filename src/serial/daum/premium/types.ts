/* istanbul ignore file */

import { DeviceProperties } from "../../../types";
import { Queue } from "../../../utils/utils";
import { Request, Response } from "../../base/comms";

export type Point = {
    lat?: number;
    lng?: number;
    elevation?: number;
    distance: number;
    slope?: number;
}

export type Route = {
    programId: number;
    points: Point[];
    type: string;
    name?: string;
    description?: string;
    lapMode: boolean;
    totalDistance: number;
    minElevation?: number;
    maxElevation?: number;
    sampleRate?: number;
}
export interface DaumPremiumDeviceProperties extends DeviceProperties {
    route?: Route,
    gear?:number,
    onStatusUpdate?:OnDeviceStartCallback,
}


export class CheckSumError extends Error {
    constructor() {
        super();
        this.message = 'checksum incorrect'
    }
}

export class ACKTimeout extends Error {
    constructor() {
        super();
        this.message = 'ACK timeout'
    }
}

export class BusyTimeout extends Error {
    constructor() {
        super();
        this.message = 'BUSY timeout'
    }
}

export type OnDeviceStartCallback = ( completed:number,total:number  ) => void;


export interface DaumPremiumRequest extends Request {
    command:string,
    payload?:string|Uint8Array
}

export interface ResponseObject extends Response {
    type: ResponseType;
    cmd?: string,
    data?: string;
    error?: Error;
}

export type ResponseType = 'ACK' | 'NAK' | 'Response' | 'Error';

export type DaumPremiumCommsState = {
    waitingForStart?: boolean;
    waitingForACK?: boolean;
    waitingForEnd?: boolean;
    partialCmd?;
    data: Queue<ResponseObject>;
};
export enum ACTUAL_BIKE_TYPE  {
    ALLROUND = 'allround',
    RACE = 'race',
    MOUNTAIN = 'mountain',
    TRIATHLON = 'triathlon'
}


