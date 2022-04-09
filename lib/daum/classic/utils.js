"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Float32ToIntArray = exports.Float32ToHex = exports.hexstr = exports.buildError = exports.parseRunData = exports.getWeight = exports.getLength = exports.getGender = exports.getBikeType = exports.getCockpit = exports.DEFAULT_BIKE_WEIGHT = exports.DEFAULT_USER_WEIGHT = exports.DEFAULT_AGE = void 0;
exports.DEFAULT_AGE = 30;
exports.DEFAULT_USER_WEIGHT = 75;
exports.DEFAULT_BIKE_WEIGHT = 10;
function getCockpit(c) {
    switch (c) {
        case 10:
            return "Cardio";
        case 20:
            return "Fitness";
        case 30:
            return "Vita De Luxe";
        case 40:
            return "8008";
        case 0x2A:
            return "8008 TRS";
        case 50:
            return "8080";
        case 60:
            return "Therapie";
        case 100:
            return "8008 TRS Pro";
        case 160:
            return "8008 TRS3";
        default:
            return "Unknown";
    }
}
exports.getCockpit = getCockpit;
function getBikeType(type) {
    if (type === undefined)
        return 0;
    switch (type) {
        case "triathlon":
            return 0;
        case "race":
            return 0;
        case "mountain":
            return 1;
        default:
            return 1;
    }
}
exports.getBikeType = getBikeType;
function getGender(sex) {
    if (sex === undefined)
        return 2;
    switch (sex) {
        case "M":
            return 1;
        case "F":
            return 1;
        default:
            return 2;
    }
}
exports.getGender = getGender;
function getLength(length) {
    if (length === undefined || length === null)
        return 180;
    let l = Math.round(length);
    if (l < 100)
        return 100;
    if (l > 220)
        return 220;
    return l;
}
exports.getLength = getLength;
function getWeight(weight) {
    if (weight === undefined || weight === null)
        return 80;
    let m = Math.round(weight);
    if (isNaN(m))
        return 80;
    if (m < 10)
        return 10;
    if (m > 250)
        return 250;
    return m;
}
exports.getWeight = getWeight;
function parseRunData(data) {
    const bikeData = {};
    bikeData.isPedalling = (data[4] > 0);
    bikeData.power = data[5] * 5;
    bikeData.cadence = data[6];
    bikeData.speed = data[7];
    bikeData.heartrate = data[14];
    bikeData.distance = (data[9] * 256 + data[8]) / 10;
    bikeData.distanceInternal = (data[9] * 256 + data[8]) * 100;
    bikeData.time = (data[11] * 256 + data[10]);
    bikeData.gear = data[16];
    return bikeData;
}
exports.parseRunData = parseRunData;
function buildError(status, err) {
    const message = err && err.message ? err.message : err;
    const error = new Error(message);
    error.status = status;
    return error;
}
exports.buildError = buildError;
function hexstr(arr, start, len) {
    var str = "";
    if (start === undefined)
        start = 0;
    if (len === undefined) {
        len = arr.length;
    }
    if (len - start > arr.length) {
        len = arr.length - start;
    }
    var j = start;
    for (var i = 0; i < len; i++) {
        var hex = Math.abs(arr[j++]).toString(16);
        if (i !== 0)
            str += " ";
        str += hex;
    }
    return str;
}
exports.hexstr = hexstr;
function Float32ToHex(float32) {
    function getHex(i) { return ('00' + i.toString(16)).slice(-2).toUpperCase(); }
    var view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, float32);
    return Array.apply(null, { length: 4 }).map((_, i) => getHex(view.getUint8(i))).join('');
}
exports.Float32ToHex = Float32ToHex;
function Float32ToIntArray(float32) {
    var view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, float32);
    var arr = [];
    for (let i = 0; i < 4; i++) {
        arr.push(view.getUint8(i));
    }
    return arr;
}
exports.Float32ToIntArray = Float32ToIntArray;
