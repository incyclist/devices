/// <reference types="node" />
import { Route } from "../../types/route";
import { User } from "../../types/user";
export declare function bin2esc(arr: any): any[];
export declare function esc2bin(arr: any): any[];
export declare function checkSum(cmdArr: any, payload: any): string;
export declare function buildMessage(command: any, payload?: any): any[];
export declare function getMessageData(command: any): any[];
export declare function hexstr(arr: any, start?: any, len?: any): string;
export declare function getHex(i: any): string;
export declare function append(cmd: any, arr: any): void;
export declare function ascii(c: any): any;
export declare function charArrayToString(arr: any): string;
export declare function asciiArrayToString(arr: any): string;
export declare function getAsciiArrayFromStr(str: any): any[];
export declare function Float32ToHex(float32: any): any;
export declare function Float32ToIntArray(float32: any): any[];
export declare function Int16ToIntArray(int16: any): any[];
export declare function Int32ToIntArray(int32: any): any[];
export declare enum ReservedCommands {
    RESULT_RESET = 0,
    RESULT_GET = 1,
    NETRACE_START = 2,
    NETRACE_STOP = 3,
    NETRACE_USERNAME = 4,
    NETRACE_USERDATA = 5,
    PERSON_GET = 6,
    PERSON_SET = 7,
    PROGRAM_LIST_BEGIN = 8,
    PROGRAM_LIST_NEW_PROGRAM = 9,
    PROGRAM_LIST_CONTINUE_PROGRAM = 10,
    PROGRAM_LIST_END = 11,
    PROGRAM_LIST_START = 12,
    RELAX_START = 12,
    RELAX_STOP = 14,
    RELAX_GET_DATA = 15,
    KEY_PRESSED = 16,
    PROGRAM_CONTROL = 17
}
export declare enum BikeType {
    ALLROUND = 0,
    RACE = 1,
    MOUNTAIN = 2
}
export declare function getBikeType(bikeTypeStr?: string): BikeType;
export declare function routeToEpp(route: Route, date?: Date): Uint8Array;
export declare function parseTrainingData(payload: any): {
    time: number;
    heartrate: number;
    speed: number;
    slope: number;
    distanceInternal: number;
    cadence: number;
    power: number;
    physEnergy: number;
    realEnergy: number;
    torque: number;
    gear: number;
    deviceState: number;
    speedStatus: string;
};
export declare function getPersonData(user: User): Buffer;
