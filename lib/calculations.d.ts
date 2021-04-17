export default class Calculations {
    static calculateSpeed(m: any, power: any, slope: any): any;
    static calculateAccelSpeed(m: any, power: any, slope: any, speedPrev: any, t: any): number;
    static calculateSpeedUncachedOld(m: any, power: any, slope: any): number;
    static calculateSpeedUncached(m: any, power: any, slope: any): number;
    static calculatePower(m: any, v: any, slope: any): number;
    static calculateForce(m: any, v: any, slope: any): number;
    static calculatePowerAccelaration(m: any, a: any, v: any): number;
    static calculatePowerResistance(m: any, v: any, slope: any): number;
    static crankPower(rpm: any, torque: any): number;
    static crankTorque(rpm: any, power: any): number;
    static crankRPM(power: any, torque: any): number;
    static calculateSpeedDaum(gear: any, rpm: any, bikeType: any): number;
}
