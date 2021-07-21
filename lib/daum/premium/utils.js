"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    const isArr = Array.isArray(arr);
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
const __commands = {
    RESULT_RESET: 0,
    RESULT_GET: 1,
    NETRACE_START: 2,
    NETRACE_STOP: 3,
    NETRACE_USERNAME: 4,
    NETRACE_USERDATA: 5,
    PERSON_GET: 6,
    PERSON_SET: 7,
    PROGRAM_LIST_BEGIN: 8,
    PROGRAM_LIST_NEW_PROGRAM: 9,
    PROGRAM_LIST_CONTINUE_PROGRAM: 10,
    PROGRAM_LIST_END: 11,
    PROGRAM_LIST_START: 12,
    RELAX_START: 12,
    RELAX_STOP: 14,
    RELAX_GET_DATA: 0xF,
    KEY_PRESSED: 0x10,
    PROGRAM_CONTROL: 17
};
function getReservedCommandKey(cmdStr) {
    return __commands[cmdStr];
}
exports.getReservedCommandKey = getReservedCommandKey;
function parseTrainingData(payload) {
    const GS = 0x1D;
    const speedVals = ['ok', 'too low', 'too high'];
    const gearVal = (v) => v > 0 ? v - 1 : undefined;
    const vals = payload.split(String.fromCharCode(GS));
    const data = {
        time: parseInt(vals[0]),
        heartrate: parseInt(vals[1]),
        speed: parseFloat(vals[2]),
        slope: parseFloat(vals[3]),
        distance: parseInt(vals[4]),
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
