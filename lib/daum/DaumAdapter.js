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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Device_1 = __importDefault(require("../Device"));
function floatVal(d) {
    if (d === undefined)
        return d;
    return parseFloat(d);
}
function intVal(d) {
    if (d === undefined)
        return d;
    return parseInt(d);
}
class DaumAdapterBase extends Device_1.default {
    constructor(props, bike) {
        super(props);
        this.bike = bike;
        this.stopped = false;
        this.paused = false;
    }
    getCurrentBikeData() {
        throw new Error('Method not implemented.');
    }
    getBike() {
        return this.bike;
    }
    isBike() {
        return true;
    }
    isPower() {
        return true;
    }
    isHrm() {
        return true;
    }
    setIgnoreHrm(ignore) {
        this.ignoreHrm = ignore;
    }
    setIgnoreBike(ignore) {
        this.ignoreBike = ignore;
    }
    isStopped() {
        return this.stopped;
    }
    initData() {
        this.distanceInternal = undefined;
        this.paused = undefined;
        this.data = {
            time: 0,
            slope: 0,
            distance: 0,
            speed: 0,
            isPedalling: false,
            power: 0,
            distanceInternal: 0
        };
        this.currentRequest = {};
        this.requests = [];
        if (this.bike.processor !== undefined)
            this.bike.processor.reset();
    }
    start(props) {
        this.stopped = false;
        return new Promise(done => done(true));
    }
    startUpdatePull() {
        if (this.iv)
            return;
        if (this.ignoreBike && this.ignoreHrm && this.ignorePower)
            return;
        this.iv = setInterval(() => {
            this.update();
        }, 1000);
    }
    connect() {
        if (!this.bike.isConnected())
            this.bike.connect();
    }
    close() {
        return this.bike.saveClose();
    }
    logEvent(event) {
        if (!this.logger)
            return;
        this.logger.logEvent(event);
    }
    sendBikeUpdate(request) {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            if (request.slope) {
                this.data.slope = request.slope;
            }
            try {
                const isReset = (!request || request.reset || Object.keys(request).length === 0);
                if (this.bike.processor !== undefined) {
                    this.bike.processor.setValues(request);
                }
                if (isReset) {
                    this.logEvent({ message: "sendBikeUpdate():reset done" });
                    resolve({});
                    return;
                }
                this.logEvent({ message: "sendBikeUpdate():sending", request });
                if (request.slope !== undefined) {
                    yield this.bike.setSlope(request.slope);
                }
                if (request.targetPower !== undefined) {
                    yield this.bike.setPower(request.targetPower);
                }
                if (request.minPower !== undefined && request.maxPower !== undefined && request.minPower === request.maxPower) {
                    yield this.bike.setPower(request.minPower);
                }
                if (request.maxPower !== undefined) {
                }
                if (request.minPower !== undefined) {
                }
                if (request.maxHrm !== undefined) {
                }
                if (request.minHrm !== undefined) {
                }
            }
            catch (err) {
                this.logEvent({ message: 'sendBikeUpdate error', error: err.message });
                resolve(undefined);
                return;
            }
            resolve(request);
        }));
    }
    stop() {
        this.logEvent({ message: 'stop request' });
        this.stopped = true;
        return new Promise((resolve, reject) => {
            try {
                if (this.iv) {
                    clearInterval(this.iv);
                    this.iv = undefined;
                }
                this.logEvent({ message: 'stop request completed' });
                this.paused = undefined;
                resolve(true);
            }
            catch (err) {
                this.logEvent({ message: 'stop error', error: err.message });
                reject(err);
            }
        });
    }
    pause() {
        return new Promise(resolve => {
            this.paused = true;
            resolve(true);
        });
    }
    resume() {
        return new Promise(resolve => {
            this.paused = false;
            resolve(true);
        });
    }
    sendUpdate(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.paused)
                return;
            this.logEvent({ message: 'sendUpdate', data });
            this.requests.push(data);
        });
    }
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.paused)
                return;
            if (!this.ignoreBike) {
                if (this.requests.length === 0) {
                    this.sendUpdate({ refresh: true });
                }
                if (this.requests.length > 0) {
                    const processing = [...this.requests];
                    processing.forEach((request) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            this.logEvent({ message: 'bike update request', request });
                            yield this.sendBikeUpdate(request);
                            this.requests.shift();
                        }
                        catch (err) {
                            this.logEvent({ message: 'bike update error', error: err.message, stack: err.stack, request });
                        }
                    }));
                }
            }
            this.getCurrentBikeData()
                .then(bikeData => {
                let prev = JSON.parse(JSON.stringify(this.data));
                let data = this.updateData(prev, bikeData);
                this.data = this.transformData(data);
                if (this.onDataFn) {
                    this.onDataFn(this.data);
                }
            })
                .catch(err => {
                this.logEvent({ message: 'bike update error', error: err.message, stack: err.stack });
            });
        });
    }
    updateData(data, bikeData) {
        data.isPedalling = bikeData.cadence > 0;
        data.power = bikeData.power;
        data.pedalRpm = bikeData.cadence;
        data.speed = bikeData.speed;
        data.heartrate = bikeData.heartrate;
        data.distance = bikeData.distance / 100;
        data.distanceInternal = bikeData.distance;
        data.time = bikeData.time;
        data.gear = bikeData.gear;
        if (this.bike.processor !== undefined) {
            data = this.bike.processor.getValues(data);
        }
        return data;
    }
    transformData(bikeData) {
        if (bikeData === undefined)
            return;
        let distance = 0;
        if (this.distanceInternal !== undefined && bikeData.distanceInternal !== undefined) {
            distance = intVal(bikeData.distanceInternal - this.distanceInternal);
        }
        if (bikeData.distanceInternal !== undefined)
            this.distanceInternal = bikeData.distanceInternal;
        let data = {
            speed: floatVal(bikeData.speed),
            slope: floatVal(bikeData.slope),
            power: intVal(bikeData.power),
            cadence: intVal(bikeData.pedalRpm),
            heartrate: intVal(bikeData.heartrate),
            distance,
            timestamp: Date.now()
        };
        if (this.ignoreHrm)
            delete data.heartrate;
        if (this.ignorePower) {
            delete data.power;
            delete data.cadence;
        }
        if (this.ignoreBike) {
            data = { heartrate: data.heartrate };
        }
        return data;
    }
}
exports.default = DaumAdapterBase;
