/* istanbul ignore file */

import { DaumBikeData, DeviceProperties } from "../../../types/device";
import { Route } from "../../../types/route";
import { Queue } from "../../../utils/utils";
import { Request, Response } from "../../comms";


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

export class ResponseTimeout extends Error {
    constructor() {
        super();
        this.message = 'RESP timeout'
    }
}

export interface DaumPremiumBikeData extends DaumBikeData {

}


export type OnDeviceStartCallback = ( completed:number,total:number  ) => void;

export type DaumPremiumAdapterProps = {
    path: string;
    ifaceName: string
}

export interface Daum8iDeviceProperties extends DeviceProperties {
    route?: Route,
    gear?:number,
    onStatusUpdate?:OnDeviceStartCallback,
}

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

