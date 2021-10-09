export declare class IllegalArgumentException extends Error {
    constructor(message: any);
}
export default class Calculations {
    static calculateSpeed(m: any, power: any, slope: any, props?: any): any;
    static calculateSpeedUncached(m: number, power: number, slope: number, props?: any): number;
    static calculatePower(m: number, v: number, slope: number, props?: any): number;
    static calculateSpeedDaum(gear: any, rpm: any, bikeType: any): number;
}
