import { IncyclistBikeData } from "../../..";
import { DaumBikeData, DeviceProperties } from "../../../types/device";
import { Queue } from "../../../utils/utils";
import { Request, Response } from "../../comms";

export type DaumClassiAdapterProps = {
    path: string;
    ifaceName?: string
}

export interface DaumClassicDeviceProperties extends DeviceProperties {
    gear?:number,
}

export interface DaumClassicRequest extends Request {
    expected:number,
    command:number[]|Uint8Array
}

export interface DaumClassicResponse extends Response {
    type: ResponseType;
    data?: Uint8Array;
    error?: Error;
}

export interface DaumClassicBikeData extends DaumBikeData {

}

export type ResponseType = 'Response' | 'Error';

export type DaumClassicCommsState = {
    data: Queue<DaumClassicResponse>;
};

export type ClassicBikeResponse = {
    bike: number
}

export interface checkCockpitReponse extends ClassicBikeResponse {
    version?: number
}

export interface GetVersionReponse extends ClassicBikeResponse {
    serialNo: string,
    cockpit: string
}


export interface SetPersonResponse extends ClassicBikeResponse {
    gender: number, 
    age:number,
    weight: number,
    length:number
}

export interface ProgResponse extends ClassicBikeResponse {    
    pedalling:boolean
}

export interface SetProgResponse extends ProgResponse {
    progNo: number
}

export interface SetPowerRepsonse extends ClassicBikeResponse {    
    power:number
}

export interface SetGearRepsonse extends ClassicBikeResponse {    
    gear:number
}

export interface SetSlopeRepsonse extends ClassicBikeResponse {    
    slope:number
}

export interface GetRunDataRepsonse extends ClassicBikeResponse,IncyclistBikeData {    
}
