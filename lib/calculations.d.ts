export declare class IllegalArgumentException extends Error {
    constructor(message: any);
}
export default class C {
    static calculateSpeed(m: number, power: number, slope: number, props?: any): number;
    static calculatePower(m: number, v: number, slope: number, props?: any): number;
    static calculateSpeedDaum(gear: number, rpm: number, bikeType?: string | number): number;
    static calculateSpeedBike(gear: number, rpm: number, chain: number[], cassette: number[], props?: {
        numGears?: number;
        wheelCirc?: number;
    }): number;
}
export declare function solveCubic(p: any, q: any): any[];
