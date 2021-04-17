"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const POS_BREMSGRIFF = 1;
const POS_TRIATHLON = 3;
let crX = 0.0033;
let g = 9.80665;
let clOL = 0.4594;
let cOL = 0.05;
let clUL = 0.3218;
let cUL = 0.05;
let clTri = 0.325;
let cTri = 0.017;
let airDensity = 1.2041;
let rho = airDensity;
let cWAs = [0.45, 0.35, 0.30, 0.25];
let k = 0.01090;
let cRR = 0.0036;
var _speedCache = {};
class Calculations {
    static calculateSpeed(m, power, slope) {
        var speed = undefined;
        let key = Math.round(m) * 1000000 + Math.round(power) * 1000 + Math.round(slope * 10);
        speed = _speedCache[key];
        if (speed !== undefined)
            return speed;
        speed = this.calculateSpeedUncached(m, power, slope);
        _speedCache[key] = speed;
        return speed;
    }
    static calculateAccelSpeed(m, power, slope, speedPrev, t) {
        let vPrev = speedPrev / 3.6;
        let Pres = Calculations.calculatePower(m, vPrev, slope);
        var P = power - Pres;
        if (P > 0) {
            let a = Math.sqrt(P / (m * t));
            let v = vPrev + a * t;
            return v * 3.6;
        }
        else {
            P = P * -1;
            let a = Math.sqrt(P / (m * t));
            let v = vPrev - a * t;
            return v * 3.6;
        }
    }
    static calculateSpeedUncachedOld(m, power, slope) {
        let c = cTri;
        let cl = clTri;
        let cr = crX;
        let sl = Math.atan(slope / 100);
        if (slope < 0) {
            let crDyn = 0.1 * Math.cos(sl);
            cl = clUL;
            c = cUL;
            cr = (1 + crDyn) * cr;
        }
        if (slope < -2) {
            let crDyn = 0.1 * Math.cos(sl);
            cl = clOL;
            c = cOL;
            cr = (1 + crDyn) * cr;
        }
        let c1 = 1.0 / (1.0 - c);
        let a = m * g * (sl + cr) * c1;
        let b = cl / 2.0 * c1;
        let p = a / b;
        let q = -1.0 * power / b;
        var z = solveCubic(p, q);
        if (z.length > 0) {
            for (var i = 0; i < z.length; i++)
                if (z[i] > 0)
                    return z[i] * 3.6;
        }
        return 0;
    }
    static calculateSpeedUncached(m, power, slope) {
        let sl = Math.atan(slope / 100);
        let c1 = 0.5 * rho * cwA(slope) + 2 * k;
        let c2 = (sl + cRR) * m * g;
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
    static calculatePower(m, v, slope) {
        let sl = Math.sin(Math.atan(slope / 100));
        let P = (0.5 * rho * cwA(slope) + 2 * k) * Math.pow(v, 3.0) + (sl + cRR) * m * g * v;
        return P;
    }
    static calculateForce(m, v, slope) {
        let sl = Math.sin(Math.atan(slope / 100));
        let F = (0.5 * rho * cwA(slope) + 2 * k) * Math.pow(v, 3.0) + (sl + cRR) * m * g * v;
        return F;
    }
    static calculatePowerAccelaration(m, a, v) {
        let P = m * a * v;
        return P;
    }
    static calculatePowerResistance(m, v, slope) {
        let P = (0.5 * rho * cwA(slope) + 2 * k) * Math.pow(v, 3.0) + cRR * m * g * v;
        return P;
    }
    static crankPower(rpm, torque) {
        return torque * rpm * 2 * Math.PI / 60.0;
    }
    static crankTorque(rpm, power) {
        return power / (rpm * 2 * Math.PI / 60.0);
    }
    static crankRPM(power, torque) {
        return power * 60 / (2 * Math.PI * torque);
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
exports.default = Calculations;
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
        return [sqrtN(q, 3)];
    }
    if (D === 0) {
        return [3 * q / p, -3 * q / (2 * p)];
    }
    if (D < 0 && p < 0) {
        var results = [];
        let phi = Math.acos(q / (2 * Math.pow(R, 3)));
        results[0] = -2 * R * Math.cos(phi / 3);
        results[1] = -2 * R * Math.cos(phi / 3 + 2 * Math.PI / 3);
        results[2] = -2 * R * Math.cos(phi / 3 + 4 * Math.PI / 3);
        return results;
    }
    if (D > 0 && p < 0) {
        let results = [];
        let phi = acosh(q / (2 * Math.pow(R, 3)));
        results[0] = -2 * R * Math.cosh(phi / 3);
        return results;
    }
    if (p > 0) {
        let results = [];
        let phi = asinh(q / (2 * Math.pow(R, 3)));
        results[0] = -2 * R * Math.sinh(phi / 3);
        return results;
    }
    return [];
}
