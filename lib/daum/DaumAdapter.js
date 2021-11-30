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
const ERGCyclingMode_1 = __importDefault(require("./ERGCyclingMode"));
const SmartTrainerCyclingMode_1 = __importDefault(require("./SmartTrainerCyclingMode"));
const DEFAULT_BIKE_WEIGHT = 10;
const DEFAULT_USER_WEIGHT = 75;
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
        const options = props || {};
        this.cyclingMode = options.cyclingMode;
        this.userSettings = options.userSettings || {};
        this.bikeSettings = options.bikeSettings || {};
        this.data = {};
    }
    setCyclingMode(mode) {
        this.cyclingMode = mode;
    }
    getSupportedCyclingModes() {
        return [ERGCyclingMode_1.default, SmartTrainerCyclingMode_1.default];
    }
    getCyclingMode() {
        if (!this.cyclingMode)
            this.setCyclingMode(this.getDefaultCyclingMode());
        return this.cyclingMode;
    }
    getDefaultCyclingMode() {
        return new SmartTrainerCyclingMode_1.default(this);
    }
    setUserSettings(userSettings) {
        this.userSettings = userSettings || {};
    }
    setBikeSettings(bikeSettings) {
        this.bikeSettings = bikeSettings || {};
    }
    getWeight() {
        const userWeight = this.userSettings.weight || (this.bike ? this.bike.getUserWeight() : undefined) || DEFAULT_USER_WEIGHT;
        const bikeWeight = this.bikeSettings.weight || (this.bike ? this.bike.getBikeWeight() : undefined) || DEFAULT_BIKE_WEIGHT;
        return bikeWeight + userWeight;
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
        if (bikeData.slope)
            data.slope = bikeData.slope;
        this.getCyclingMode().updateData(data);
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
    sendRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const bike = this.getBike();
                const isReset = (!request || request.reset || Object.keys(request).length === 0);
                if (isReset) {
                    return {};
                }
                if (request.slope !== undefined) {
                    yield bike.setSlope(request.slope);
                }
                if (request.targetPower !== undefined) {
                    yield bike.setPower(request.targetPower);
                }
                return request;
            }
            catch (err) {
                this.logEvent({ message: 'error', fn: 'sendRequest()', error: err.message || err });
                return;
            }
        });
    }
    sendBikeUpdate(request) {
        if (request.slope) {
            this.data.slope = request.slope;
        }
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request);
            const res = yield this.sendRequest(bikeRequest);
            resolve(res);
        }));
    }
}
exports.default = DaumAdapterBase;
