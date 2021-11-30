"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const POS_OBERLENKER = 0;
const POS_BREMSGRIFF = 1;
const POS_UNTERLENKER = 2;
const POS_TRIATHLON = 3;
const g = 9.80665;
const rho = 1.2041;
const cWAs = [0.45, 0.35, 0.30, 0.25];
const k = 0.01090;
const cRR = 0.0036;
var _speedCache = {};
class IllegalArgumentException extends Error {
    constructor(message) {
        super(message);
        this.name = "IllegalArgumentException";
    }
}
exports.IllegalArgumentException = IllegalArgumentException;
class C {
    static calculateSpeed(m, power, slope, props = {}) {
        var speed = undefined;
        let key = `${Math.round(m * 10)} ${Math.round(power)} ${Math.round(slope * 10)} ${JSON.stringify(props)}`;
        speed = _speedCache[key];
        if (speed !== undefined)
            return speed;
        speed = this.calculateSpeedUncached(m, power, slope, props);
        _speedCache[key] = speed;
        return speed;
    }
    static calculateSpeedUncached(m, power, slope, props = {}) {
        if (m === undefined || m === null || m < 0)
            throw new IllegalArgumentException("m must be a positive number");
        if (power === undefined || power === null || power < 0)
            throw new IllegalArgumentException("power must be a positive number");
        if (slope === undefined || slope === null)
            slope = 0;
        const _rho = props.rho || rho;
        const _cRR = props.cRR || cRR;
        const _cwA = props.cwA || cwA(slope);
        let sl = Math.atan(slope / 100);
        let c1 = 0.5 * _rho * _cwA + 2 * k;
        let c2 = (sl + _cRR) * m * g;
        let p = c2 / c1;
        let q = -1.0 * power / c1;
        var z = solveCubic(p, q);
        if (z.length > 0) {
            for (var i = 0; i < z.length; i++)
                if (z[i] > 0)
                    return z[i] * 3.6;
        }
        return 0;
    }
    static calculatePower(m, v, slope, props = {}) {
        if (m === undefined || m === null || m < 0)
            throw new IllegalArgumentException("m must be a positive number");
        if (v === undefined || v === null || v < 0)
            throw new IllegalArgumentException("v must be a positive number");
        if (slope === undefined || slope === null)
            slope = 0;
        let _rho = props.rho || rho;
        let _cRR = props.cRR || cRR;
        let _cwA = props.cwA || cwA(slope);
        let sl = Math.sin(Math.atan(slope / 100));
        let P = (0.5 * _rho * _cwA + 2 * k) * Math.pow(v, 3.0) + (sl + _cRR) * m * g * v;
        return P;
    }
    static calculateSpeedDaum(gear, rpm, bikeType) {
        if (bikeType === 0 || bikeType === undefined || bikeType === "race") {
            let lengthRPM = 210;
            let gearRatio = 1.75 + (gear - 1) * 0.098767;
            let distRotation = lengthRPM * gearRatio;
            let speed = rpm * distRotation * 0.0006;
            return speed;
        }
        else {
            let lengthRPM = 185;
            let gearRatio = 0.67 + (gear - 1) * 0.1485;
            let distRotation = lengthRPM * gearRatio;
            let speed = rpm * distRotation * 0.0006;
            return speed;
        }
    }
}
exports.default = C;
function cwA(slope) {
    let cw = cWAs[POS_TRIATHLON];
    if (slope <= -5)
        cw = cWAs[POS_BREMSGRIFF];
    else if (slope > -5 && slope < -1) {
        let pct = (slope + 5) / 4;
        cw = cWAs[POS_TRIATHLON] + pct * (cWAs[POS_BREMSGRIFF] - cWAs[POS_TRIATHLON]);
    }
    return cw;
}
function acosh(x) {
    return Math.log(x + Math.sqrt(x * x - 1.0));
}
function asinh(x) {
    return Math.log(x + Math.sqrt(x * x + 1.0));
}
function sqrtN(x, n) {
    let exp = 1.0 / n;
    if (Math.sign(x) === 1 || n % 2 === 0) {
        return Math.pow(x, exp);
    }
    return Math.sign(x) * Math.pow(Math.abs(x), exp);
}
function solveCubic(p, q) {
    let D = Math.pow(q / 2.0, 2) + Math.pow(p / 3.0, 3);
    let R = Math.sign(q) * Math.sqrt(Math.abs(p) / 3.0);
    if (p === 0) {
        return [sqrtN(-1 * q, 3)];
    }
    if (D === 0) {
        return [3 * q / p, -3 * q / (2 * p)];
    }
    if (D < 0 && p < 0) {
        const results = [];
        let phi = Math.acos(q / (2 * Math.pow(R, 3)));
        results[0] = -2 * R * Math.cos(phi / 3);
        results[1] = -2 * R * Math.cos(phi / 3 + 2 * Math.PI / 3);
        results[2] = -2 * R * Math.cos(phi / 3 + 4 * Math.PI / 3);
        return results;
    }
    if (D > 0 && p < 0) {
        const results = [];
        let phi = acosh(q / (2 * Math.pow(R, 3)));
        results[0] = -2 * R * Math.cosh(phi / 3);
        return results;
    }
    const results = [];
    let phi = asinh(q / (2 * Math.pow(R, 3)));
    results[0] = -2 * R * Math.sinh(phi / 3);
    return results;
}
exports.solveCubic = solveCubic;
