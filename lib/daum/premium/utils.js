"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPersonData = exports.parseTrainingData = exports.routeToEpp = exports.getBikeType = exports.BikeType = exports.ReservedCommands = exports.Int32ToIntArray = exports.Int16ToIntArray = exports.Float32ToIntArray = exports.Float32ToHex = exports.getAsciiArrayFromStr = exports.asciiArrayToString = exports.charArrayToString = exports.ascii = exports.append = exports.getHex = exports.hexstr = exports.getMessageData = exports.buildMessage = exports.checkSum = exports.esc2bin = exports.bin2esc = void 0;
const user_1 = require("../../types/user");
const utils_1 = require("../classic/utils");
const win32filetime_1 = __importDefault(require("win32filetime"));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
function bin2esc(arr) {
    if (arr === undefined) {
        return;
    }
    const res = [];
    arr.forEach(v => {
        switch (v) {
            case 18:
                res.push(34);
                res.push(18);
                break;
            case 34:
                res.push(34);
                res.push(34);
                break;
            case 1:
                res.push(34);
                res.push(17);
                break;
            case 23:
                res.push(34);
                res.push(39);
                break;
            case 6:
                res.push(34);
                res.push(32);
                break;
            case 21:
                res.push(34);
                res.push(37);
                break;
            default:
                res.push(v);
        }
    });
    return res;
}
exports.bin2esc = bin2esc;
function esc2bin(arr) {
    if (arr === undefined) {
        return;
    }
    const res = [];
    let escaped = false;
    arr.forEach((v, idx) => {
        if (escaped) {
            escaped = false;
            switch (v) {
                case 17:
                    res.push(1);
                    return;
                case 39:
                    res.push(23);
                    return;
                case 22:
                    res.push(6);
                    return;
                case 37:
                    res.push(21);
                    return;
                case 18:
                    res.push(18);
                    return;
                default: res.push(v);
            }
            return;
        }
        if (v === 34) {
            escaped = true;
        }
        else {
            res.push(v);
        }
    });
    return res;
}
exports.esc2bin = esc2bin;
function checkSum(cmdArr, payload) {
    const total = sum(cmdArr) + sum(payload);
    const checkSumVal = total % 100;
    let checkSumStr = checkSumVal.toString();
    while (checkSumStr.length < 2)
        checkSumStr = '0' + checkSumStr;
    return checkSumStr;
}
exports.checkSum = checkSum;
function buildMessage(command, payload) {
    const cmdArr = getAsciiArrayFromStr(command);
    let data = payload || [];
    if (typeof (payload) === 'number')
        data = [payload];
    if (typeof (payload) === 'string')
        data = getAsciiArrayFromStr(payload);
    const checkSumVals = getAsciiArrayFromStr(checkSum(cmdArr, data));
    const message = [];
    message.push(0x01);
    message.push(...cmdArr);
    if (data.length > 0)
        message.push(...data);
    message.push(...checkSumVals);
    message.push(0x17);
    return message;
}
exports.buildMessage = buildMessage;
function getMessageData(command) {
    const res = [...command];
    res.splice(0, 4);
    res.splice(-3, 3);
    return res;
}
exports.getMessageData = getMessageData;
function hexstr(arr, start, len) {
    const isArr = Array.isArray(arr) || arr instanceof Uint8Array;
    if (!arr)
        return '';
    var str = "";
    if (start === undefined)
        start = 0;
    if (len === undefined || (start + len > arr.length)) {
        len = arr.length - start;
    }
    if (len < 0)
        return '';
    var j = start;
    for (var i = 0; i < len; i++) {
        const c = isArr ? arr[j++] : ascii(arr.charAt(j++));
        var hex = Math.abs(c).toString(16);
        if (hex.length < 2)
            hex = '0' + hex;
        if (i !== 0)
            str += " ";
        str += hex;
    }
    return str;
}
exports.hexstr = hexstr;
function getHex(i) { return ('00' + i.toString(16)).slice(-2); }
exports.getHex = getHex;
function append(cmd, arr) { cmd.push(...arr); }
exports.append = append;
function ascii(c) {
    if (c === undefined || c === null)
        return;
    return c.charCodeAt(0);
}
exports.ascii = ascii;
function charArrayToString(arr) {
    if (arr === undefined || arr == null)
        return undefined;
    let str = '';
    arr.forEach(c => str += c);
    return str;
}
exports.charArrayToString = charArrayToString;
function asciiArrayToString(arr) {
    if (arr === undefined || arr == null)
        return undefined;
    let str = '';
    arr.forEach(c => str += String.fromCharCode(c));
    return str;
}
exports.asciiArrayToString = asciiArrayToString;
function getAsciiArrayFromStr(str) {
    if (str === undefined || str === null)
        return undefined;
    const n = str.length;
    let result = [];
    for (let i = 0; i < n; i++) {
        result.push(str.charCodeAt(i));
    }
    return result;
}
exports.getAsciiArrayFromStr = getAsciiArrayFromStr;
function Float32ToHex(float32) {
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
function Int16ToIntArray(int16) {
    var view = new DataView(new ArrayBuffer(2));
    view.setInt16(0, int16);
    var arr = [];
    for (let i = 0; i < 2; i++) {
        arr.push(view.getUint8(i));
    }
    return arr;
}
exports.Int16ToIntArray = Int16ToIntArray;
function Int32ToIntArray(int32) {
    var view = new DataView(new ArrayBuffer(4));
    view.setInt32(0, int32);
    var arr = [];
    for (let i = 0; i < 4; i++) {
        arr.push(view.getUint8(i));
    }
    return arr;
}
exports.Int32ToIntArray = Int32ToIntArray;
var ReservedCommands;
(function (ReservedCommands) {
    ReservedCommands[ReservedCommands["RESULT_RESET"] = 0] = "RESULT_RESET";
    ReservedCommands[ReservedCommands["RESULT_GET"] = 1] = "RESULT_GET";
    ReservedCommands[ReservedCommands["NETRACE_START"] = 2] = "NETRACE_START";
    ReservedCommands[ReservedCommands["NETRACE_STOP"] = 3] = "NETRACE_STOP";
    ReservedCommands[ReservedCommands["NETRACE_USERNAME"] = 4] = "NETRACE_USERNAME";
    ReservedCommands[ReservedCommands["NETRACE_USERDATA"] = 5] = "NETRACE_USERDATA";
    ReservedCommands[ReservedCommands["PERSON_GET"] = 6] = "PERSON_GET";
    ReservedCommands[ReservedCommands["PERSON_SET"] = 7] = "PERSON_SET";
    ReservedCommands[ReservedCommands["PROGRAM_LIST_BEGIN"] = 8] = "PROGRAM_LIST_BEGIN";
    ReservedCommands[ReservedCommands["PROGRAM_LIST_NEW_PROGRAM"] = 9] = "PROGRAM_LIST_NEW_PROGRAM";
    ReservedCommands[ReservedCommands["PROGRAM_LIST_CONTINUE_PROGRAM"] = 10] = "PROGRAM_LIST_CONTINUE_PROGRAM";
    ReservedCommands[ReservedCommands["PROGRAM_LIST_END"] = 11] = "PROGRAM_LIST_END";
    ReservedCommands[ReservedCommands["PROGRAM_LIST_START"] = 12] = "PROGRAM_LIST_START";
    ReservedCommands[ReservedCommands["RELAX_START"] = 12] = "RELAX_START";
    ReservedCommands[ReservedCommands["RELAX_STOP"] = 14] = "RELAX_STOP";
    ReservedCommands[ReservedCommands["RELAX_GET_DATA"] = 15] = "RELAX_GET_DATA";
    ReservedCommands[ReservedCommands["KEY_PRESSED"] = 16] = "KEY_PRESSED";
    ReservedCommands[ReservedCommands["PROGRAM_CONTROL"] = 17] = "PROGRAM_CONTROL";
})(ReservedCommands = exports.ReservedCommands || (exports.ReservedCommands = {}));
var BikeType;
(function (BikeType) {
    BikeType[BikeType["ALLROUND"] = 0] = "ALLROUND";
    BikeType[BikeType["RACE"] = 1] = "RACE";
    BikeType[BikeType["MOUNTAIN"] = 2] = "MOUNTAIN";
})(BikeType = exports.BikeType || (exports.BikeType = {}));
function getBikeType(bikeTypeStr) {
    if (bikeTypeStr === undefined || bikeTypeStr === null)
        return BikeType.RACE;
    if (bikeTypeStr.toLowerCase() === 'mountain')
        return BikeType.MOUNTAIN;
    return BikeType.RACE;
}
exports.getBikeType = getBikeType;
function routeToEpp(route, date) {
    const buffer = Buffer.alloc(376 + route.points.length * 12);
    const fileTime = win32filetime_1.default.fromUnix(date ? date : Date.now());
    let offset = 0;
    const name = route.name || '';
    const description = route.description || '';
    const minElevation = route.minElevation ? route.minElevation : 0;
    const maxElevation = route.maxElevation ? route.minElevation : Math.max(...route.points.map(p => p.elevation));
    const sampleRate = route.points.length !== 0 ? Math.round(route.totalDistance / route.points.length) : 0;
    buffer.writeUInt32LE(fileTime.low, offset);
    offset += 4;
    buffer.writeUInt32LE(fileTime.high, offset);
    offset += 4;
    buffer.write(name, offset, name.length, 'ascii');
    offset += 64;
    buffer.write(description, offset, description.length, 'ascii');
    offset += 256;
    buffer.writeInt32LE(0x10, offset);
    offset += 4;
    buffer.writeInt32LE(0x0, offset);
    offset += 4;
    buffer.writeInt32LE(minElevation, offset);
    offset += 4;
    buffer.writeInt32LE(maxElevation, offset);
    offset += 4;
    buffer.writeInt32LE(route.points.length, offset);
    offset += 4;
    buffer.writeInt32LE(sampleRate, offset);
    offset += 4;
    buffer.writeInt32LE(0x01, offset);
    offset += 4;
    buffer.writeInt32LE(0x0, offset);
    offset += 4;
    buffer.writeInt16LE(0x0, offset);
    offset += 2;
    buffer.writeInt16LE(0x0, offset);
    offset += 2;
    buffer.writeInt32LE(0x0, offset);
    offset += 4;
    buffer.writeInt32LE(0x0, offset);
    offset += 4;
    buffer.writeInt32LE(0x0, offset);
    offset += 4;
    route.points.forEach(p => {
        buffer.writeUInt32LE(sampleRate, offset);
        offset += 4;
        buffer.writeFloatLE(p.elevation, offset);
        offset += 4;
        buffer.writeFloatLE(0, offset);
        offset += 4;
    });
    return new Uint8Array(buffer);
}
exports.routeToEpp = routeToEpp;
function parseTrainingData(payload) {
    const GS = 0x1D;
    const speedVals = ['ok', 'too low', 'too high'];
    const gearVal = (v) => v > 0 ? v - 1 : undefined;
    const vals = payload.split(String.fromCharCode(GS));
    const data = {
        time: parseInt(vals[0]),
        heartrate: parseInt(vals[1]),
        speed: parseFloat(vals[2]) * 3.6,
        slope: parseFloat(vals[3]),
        distanceInternal: parseInt(vals[4]),
        cadence: parseFloat(vals[5]),
        power: parseInt(vals[6]),
        physEnergy: parseFloat(vals[7]),
        realEnergy: parseFloat(vals[8]),
        torque: parseFloat(vals[9]),
        gear: gearVal(parseInt(vals[10])),
        deviceState: parseInt(vals[11]),
        speedStatus: speedVals[parseInt(vals[12])],
    };
    return data;
}
exports.parseTrainingData = parseTrainingData;
function getPersonData(user) {
    const buffer = Buffer.alloc(136);
    let offset = 0;
    for (let i = 0; i < 4; i++) {
        buffer.writeInt32LE(0, offset);
        offset += 4;
        buffer.writeFloatLE(-100, offset);
        offset += 4;
        buffer.writeFloatLE(0, offset);
        offset += 4;
        buffer.writeFloatLE(0, offset);
        offset += 4;
        buffer.writeUInt16LE(0, offset);
        offset += 2;
        buffer.writeUInt16LE(0, offset);
        offset += 2;
        buffer.writeUInt16LE(0, offset);
        offset += 2;
        buffer.writeUInt16LE(0, offset);
        offset += 2;
        buffer.writeUInt8(0, offset);
        offset += 1;
        buffer.writeUInt8(0, offset);
        offset += 1;
        buffer.writeUInt8(0, offset);
        offset += 1;
        buffer.writeUInt8(0, offset);
        offset += 1;
    }
    buffer.writeInt32LE(user.sex === user_1.Gender.FEMALE ? 2 : 1, offset);
    offset += 4;
    buffer.writeInt32LE(user.age !== undefined ? user.age : utils_1.DEFAULT_AGE, offset);
    offset += 4;
    buffer.writeInt32LE(user.length !== undefined ? user.length : 180, offset);
    offset += 4;
    buffer.writeFloatLE(user.weight !== undefined ? user.weight : utils_1.DEFAULT_USER_WEIGHT, offset);
    offset += 4;
    buffer.writeFloatLE(0, offset);
    offset += 4;
    buffer.writeUInt32LE(0, offset);
    offset += 4;
    return buffer;
}
exports.getPersonData = getPersonData;
