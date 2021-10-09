"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = (x) => {
    return new Promise(ok => { setTimeout(() => { ok(); }, x); });
};
function runWithRetries(fn, maxRetries, timeBetween) {
    return new Promise((resolve, reject) => {
        let retries = 0;
        let tLastFailure = undefined;
        let busy = false;
        const iv = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            const tNow = Date.now();
            if (busy)
                return;
            if (tLastFailure === undefined || tNow - tLastFailure > timeBetween) {
                try {
                    busy = true;
                    const data = yield fn();
                    busy = false;
                    clearInterval(iv);
                    return resolve(data);
                }
                catch (err) {
                    tLastFailure = Date.now();
                    retries++;
                    if (retries >= maxRetries) {
                        clearInterval(iv);
                        busy = false;
                        return reject(err);
                    }
                    else {
                        busy = false;
                    }
                }
            }
        }), 50);
    });
}
exports.runWithRetries = runWithRetries;
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
class Queue {
    constructor(values) {
        this.data = [];
        if (values)
            this.data = values;
    }
    size() {
        return this.data ? this.data.length : 0;
    }
    clear() {
        this.data = [];
    }
    isEmpty() {
        return this.data === undefined || this.data.length === 0;
    }
    dequeue() {
        const removed = this.data.splice(0, 1);
        return removed[0];
    }
    enqueue(value) {
        this.data.push(value);
    }
}
exports.Queue = Queue;
