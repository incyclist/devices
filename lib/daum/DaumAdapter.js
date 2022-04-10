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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Device_1 = __importStar(require("../Device"));
const ERGCyclingMode_1 = __importDefault(require("./ERGCyclingMode"));
const SmartTrainerCyclingMode_1 = __importDefault(require("./SmartTrainerCyclingMode"));
const PowerMeterCyclingMode_1 = __importDefault(require("./PowerMeterCyclingMode"));
const utils_1 = require("../utils");
class DaumAdapterBase extends Device_1.default {
    constructor(props, bike) {
        super(props);
        this.requests = [];
        this.adapterTime = 0;
        this.requestBusy = false;
        this.updateBusy = false;
        this.bike = bike;
        this.stopped = false;
        this.paused = false;
        this.daumRunData = {
            isPedalling: false,
            time: 0,
            power: 0,
            pedalRpm: 0,
            speed: 0,
            distanceInternal: 0,
            heartrate: 0
        };
        this.deviceData = {};
        const options = props || {};
        this.cyclingMode = options.cyclingMode;
        this.setUserSettings(options.userSettings);
        this.setBikeSettings(options.bikeSettings);
    }
    setCyclingMode(mode, settings) {
        let selectedMode;
        if (typeof mode === 'string') {
            const supported = this.getSupportedCyclingModes();
            const CyclingModeClass = supported.find(M => { const m = new M(this); return m.getName() === mode; });
            if (CyclingModeClass) {
                this.cyclingMode = new CyclingModeClass(this, settings);
                return;
            }
            selectedMode = this.getDefaultCyclingMode();
        }
        else {
            selectedMode = mode;
        }
        this.cyclingMode = selectedMode;
        this.cyclingMode.setSettings(settings);
    }
    getSupportedCyclingModes() {
        return [ERGCyclingMode_1.default, SmartTrainerCyclingMode_1.default, PowerMeterCyclingMode_1.default];
    }
    getCyclingMode() {
        if (!this.cyclingMode)
            this.setCyclingMode(this.getDefaultCyclingMode());
        return this.cyclingMode;
    }
    getDefaultCyclingMode() {
        return new ERGCyclingMode_1.default(this);
    }
    setUserSettings(userSettings) {
        this.userSettings = userSettings || {};
        if (this.bike) {
            if (!this.bike.settings)
                this.bike.settings = { user: {} };
            if (!this.bike.settings.user)
                this.bike.settings.user = {};
            this.bike.settings.user.weight = this.userSettings.weight || Device_1.DEFAULT_USER_WEIGHT;
        }
    }
    setBikeSettings(bikeSettings) {
        this.bikeSettings = bikeSettings || {};
        if (this.bike) {
            if (!this.bike.settings)
                this.bike.settings = {};
            this.bike.settings.weight = this.userSettings.weight || Device_1.DEFAULT_BIKE_WEIGHT;
        }
    }
    getWeight() {
        const userWeight = this.userSettings.weight || Device_1.DEFAULT_USER_WEIGHT;
        const bikeWeight = this.bikeSettings.weight || Device_1.DEFAULT_BIKE_WEIGHT;
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
        this.paused = false;
        this.stopped = false;
        this.daumRunData = {
            isPedalling: false,
            time: 0,
            power: 0,
            pedalRpm: 0,
            speed: 0,
            distanceInternal: 0,
            heartrate: 0
        };
        this.deviceData = {};
        this.currentRequest = {};
        this.requests = [];
        const name = this.getCyclingMode().getName();
        const settings = this.getCyclingMode().getSettings();
        this.setCyclingMode(name, settings);
    }
    start(props) {
        throw new Error('Method not implemented.');
    }
    startUpdatePull() {
        if (this.iv)
            return;
        if (this.ignoreBike && this.ignoreHrm && this.ignorePower)
            return;
        const ivSync = setInterval(() => {
            this.bikeSync();
        }, 1000);
        const ivUpdate = setInterval(() => {
            this.sendData();
            this.refreshRequests();
        }, 1000);
        this.iv = {
            sync: ivSync,
            update: ivUpdate
        };
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
                    if (this.iv.sync)
                        clearInterval(this.iv.sync);
                    if (this.iv.update)
                        clearInterval(this.iv.update);
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
        this.logEvent({ message: 'pause' });
        return new Promise(resolve => {
            this.paused = true;
            resolve(true);
        });
    }
    resume() {
        this.logEvent({ message: 'resume' });
        return new Promise(resolve => {
            this.paused = false;
            resolve(true);
        });
    }
    sendUpdate(request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.paused)
                return;
            this.logEvent({ message: 'sendUpdate', request, waiting: this.requests.length });
            return yield this.processClientRequest(request);
        });
    }
    sendData() {
        if (this.onDataFn)
            this.onDataFn(this.deviceData);
    }
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            this.updateBusy = true;
            this.getCurrentBikeData()
                .then(bikeData => {
                this.updateData(this.daumRunData, bikeData);
                this.transformData();
                this.updateBusy = false;
            })
                .catch(err => {
                this.logEvent({ message: 'bike update error', error: err.message, stack: err.stack });
                this.updateBusy = false;
            });
        });
    }
    sendRequests() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.requests.length > 0) {
                const processing = [...this.requests];
                const cnt = processing.length;
                processing.forEach((request, idx) => __awaiter(this, void 0, void 0, function* () {
                    if (cnt > 1 && idx < cnt - 1) {
                        this.logEvent({ message: 'ignoring bike update request', request });
                        this.requests.shift();
                        return;
                    }
                }));
                const request = processing[0];
                try {
                    yield this.sendRequest(request);
                    this.requests.shift();
                }
                catch (err) {
                    this.logEvent({ message: 'bike update error', error: err.message, stack: err.stack, request });
                }
            }
        });
    }
    bikeSync() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.paused) {
                return;
            }
            if (this.updateBusy || this.requestBusy) {
                return;
            }
            this.logEvent({ message: 'bikeSync' });
            if (!this.ignoreBike) {
                yield this.sendRequests();
            }
            yield this.update();
        });
    }
    updateData(prev, bikeData) {
        let data = {};
        data.isPedalling = bikeData.cadence > 0;
        data.power = bikeData.power;
        data.pedalRpm = bikeData.cadence;
        data.speed = bikeData.speed;
        data.heartrate = bikeData.heartrate;
        data.distanceInternal = bikeData.distanceInternal;
        data.gear = bikeData.gear;
        data.time = bikeData.time;
        if (bikeData.slope)
            data.slope = bikeData.slope;
        this.daumRunData = this.getCyclingMode().updateData(data);
    }
    transformData() {
        if (this.daumRunData === undefined)
            return;
        let distance = 0;
        if (this.distanceInternal !== undefined && this.daumRunData.distanceInternal !== undefined) {
            distance = utils_1.intVal(this.daumRunData.distanceInternal - this.distanceInternal);
        }
        if (this.daumRunData.distanceInternal !== undefined)
            this.distanceInternal = this.daumRunData.distanceInternal;
        let data = {
            speed: utils_1.floatVal(this.daumRunData.speed),
            slope: utils_1.floatVal(this.daumRunData.slope),
            power: utils_1.intVal(this.daumRunData.power),
            cadence: utils_1.intVal(this.daumRunData.pedalRpm),
            heartrate: utils_1.intVal(this.daumRunData.heartrate),
            distance,
            timestamp: Date.now(),
            deviceTime: this.daumRunData.time,
            deviceDistanceCounter: this.daumRunData.distanceInternal
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
        this.deviceData = data;
    }
    sendRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            this.requestBusy = true;
            try {
                this.logEvent({ message: 'sendRequest', request });
                const bike = this.getBike();
                const isReset = (!request || request.reset || Object.keys(request).length === 0);
                if (isReset) {
                    this.requestBusy = false;
                    return {};
                }
                if (request.slope !== undefined) {
                    yield bike.setSlope(request.slope);
                }
                if (request.targetPower !== undefined) {
                    yield bike.setPower(request.targetPower);
                }
                this.requestBusy = false;
                return request;
            }
            catch (err) {
                this.requestBusy = false;
                this.logEvent({ message: 'error', fn: 'sendRequest()', error: err.message || err });
                return;
            }
        });
    }
    refreshRequests() {
        if (!this.daumRunData.isPedalling || this.daumRunData.pedalRpm === 0)
            return;
        let bikeRequest = this.getCyclingMode().sendBikeUpdate({ refresh: true }) || {};
        const prev = this.requests[this.requests.length - 1] || {};
        if (bikeRequest.targetPower !== undefined && bikeRequest.targetPower !== prev.targetPower) {
            this.logEvent({ message: 'add request', request: bikeRequest });
            this.requests.push(bikeRequest);
        }
    }
    processClientRequest(request) {
        if (request.slope !== undefined) {
            this.daumRunData.slope = request.slope;
        }
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request);
            this.logEvent({ message: 'add request', request: bikeRequest });
            this.requests.push(bikeRequest);
            resolve(bikeRequest);
        }));
    }
}
exports.default = DaumAdapterBase;
