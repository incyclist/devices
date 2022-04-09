"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const Device_1 = __importStar(require("../../Device"));
const gd_eventlog_1 = require("gd-eventlog");
const comms_1 = __importDefault(require("../comms"));
const utils_1 = require("../../utils");
const power_meter_1 = __importDefault(require("./modes/power-meter"));
class KettlerRacerAdapter extends Device_1.default {
    constructor(protocol, settings) {
        super(protocol);
        this.requests = [];
        this.logger = new gd_eventlog_1.EventLogger('KettlerRacer');
        this.settings = settings;
        this.ignoreHrm = false;
        this.ignorePower = false;
        this.ignoreBike = false;
        this.paused = false;
        this.iv = null;
        this.comms = new comms_1.default({ protocol, port: this.settings.port, logger: this.logger });
    }
    isBike() { return true; }
    isPower() { return true; }
    isHrm() { return true; }
    setID(id) {
        this.id = id;
    }
    getID() {
        return this.id;
    }
    getName() {
        return this.settings.name || this.getProtocolName();
    }
    getPort() {
        return this.settings.port;
    }
    setIgnoreHrm(ignore) {
        this.ignoreHrm = ignore;
    }
    setIgnorePower(ignore) {
        this.ignorePower = ignore;
    }
    setIgnoreBike(ignore) {
        this.ignoreBike = ignore;
    }
    _getComms() {
        return this.comms;
    }
    _setComms(comms) {
        this.comms = comms;
    }
    getLogger() {
        return this.logger;
    }
    getUserSettings() {
        return this.settings.userSettings || { weight: Device_1.DEFAULT_USER_WEIGHT };
    }
    getWeight() {
        let userWeight = Device_1.DEFAULT_USER_WEIGHT;
        let bikeWeight = Device_1.DEFAULT_BIKE_WEIGHT;
        if (this.settings.userSettings && this.settings.userSettings.weight) {
            userWeight = this.settings.userSettings.weight;
        }
        if (this.settings.bikeSettings && this.settings.bikeSettings.weight) {
            userWeight = this.settings.bikeSettings.weight;
        }
        return bikeWeight + userWeight;
    }
    setComputerMode() {
        return this.send('setComputerMode', 'CP').then(response => {
            this.logger.logEvent({ response });
            if (response === 'ACK' || response === 'RUN') {
                return true;
            }
            else {
                return false;
            }
        });
    }
    setClientMode() {
        return this.send('setClientMode', 'CM').then(response => {
            this.logger.logEvent({ response });
            if (response === 'ACK' || response === 'RUN') {
                return true;
            }
            else {
                return false;
            }
        });
    }
    reset() {
        return this.send('reset', 'RS').then(response => {
            this.logger.logEvent({ response });
            if (response === 'ACK' || response === 'RUN') {
                return true;
            }
            else {
                return false;
            }
        });
    }
    getIdentifier() {
        return this.send('getIdentifier', 'ID').then(response => {
            this.logger.logEvent({ response });
            return response.substring(0, 3);
        });
    }
    getInterface() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.send('getInterface', 'KI');
            this.logger.logEvent({ interface: res });
            return res;
        });
    }
    getVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.send('getVersion', 'VE');
            this.logger.logEvent({ version: res });
            return res;
        });
    }
    getCalibration() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.send('getCalibration', 'CA');
        });
    }
    startTraining() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.send('startTraining', 'LB');
        });
    }
    unknownSN() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.send('SN', 'SN');
        });
    }
    setBaudrate(baudrate) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.send(`setBaudrate(${baudrate})`, `BR${baudrate}`);
        });
    }
    setPower(power) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.send(`setPower(${power})`, `PW${power}`).then(response => {
                const data = this.parseStatus(response);
                return data;
            });
        });
    }
    getExtendedStatus() {
        return this.send('getExtendedStatus', 'ES1').then(response => {
            const data = this.parseExtendedStatus(response);
            return data;
        });
    }
    getStatus() {
        return this.send('getStatus', 'ST').then(response => {
            const data = this.parseStatus(response);
            return data;
        });
    }
    getDB() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.send('getDB', 'DB');
        });
    }
    send(logStr, message, timeout) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const opened = yield this.waitForOpened();
                    if (!opened) {
                        reject(new Error('connection error'));
                    }
                }
                catch (err) {
                    reject(err);
                }
                this.comms.send({ logStr, message, onResponse: resolve, onError: reject, timeout });
            }));
        });
    }
    parseExtendedStatus(data) {
        const result = {};
        return result;
    }
    parseStatus(data) {
        const states = data.split('\t');
        const result = {};
        if (states.length === 8) {
            const hr = parseInt(states[0]);
            if (!isNaN(hr)) {
                result.heartrate = hr;
            }
            var cadence = parseInt(states[1]);
            if (!isNaN(cadence)) {
                result.cadence = cadence;
            }
            const speed = parseInt(states[2]);
            if (!isNaN(speed)) {
                result.speed = speed * 0.1;
            }
            const distance = parseInt(states[3]);
            if (!isNaN(distance)) {
                result.distance = distance;
            }
            const requestedPower = parseInt(states[4]);
            if (!isNaN(requestedPower)) {
                result.requestedPower = requestedPower;
            }
            const energy = parseInt(states[5]);
            if (!isNaN(energy)) {
                result.requestedPower = energy;
            }
            const timeStr = states[6];
            const time = timeStr.split(':');
            const hours = parseInt(time[0]);
            const minutes = parseInt(time[1]);
            if (!isNaN(hours) && !isNaN(minutes)) {
                result.time = hours * 60 + minutes;
            }
            const power = parseInt(states[7]);
            if (!isNaN(power)) {
                result.power = power;
            }
            result.timestamp = Date.now();
        }
        return result;
    }
    check() {
        return __awaiter(this, void 0, void 0, function* () {
            var info = {};
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                this.logger.logEvent({ message: "check()", port: this.getPort() });
                let iv = undefined;
                try {
                    if (!info.opened)
                        info.opened = yield this.waitForOpened();
                    iv = setTimeout(() => {
                        this.logger.logEvent({ message: "check() timeout", port: this.getPort() });
                        reject(new Error(`timeout`));
                    }, 5000);
                    if (!info.pcMode)
                        info.pcMode = yield this.setClientMode();
                    if (!info.id)
                        info.id = yield this.getIdentifier();
                    if (!info.version)
                        info.version = yield this.getVersion();
                    try {
                        yield this.getInterface();
                    }
                    catch (e) {
                        this.logger.logEvent({ message: 'Error', error: e.message });
                    }
                    clearTimeout(iv);
                    resolve(info);
                }
                catch (err) {
                    this.logger.logEvent({ message: 'Error', error: err.message });
                    if (iv)
                        clearTimeout(iv);
                    iv = undefined;
                    reject(err);
                }
            }));
        });
    }
    start(props) {
        this.logger.logEvent({ message: 'start()' });
        var info = {};
        return (0, utils_1.runWithRetries)(() => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!info.checkDone) {
                    info.checkDone = yield this.check();
                }
                try {
                    if (!info.started) {
                        info.started = yield this.startTraining();
                    }
                }
                catch (e) {
                    this.logger.logEvent({ message: 'Error', error: e.message });
                }
                try {
                    yield this.setPower(100);
                }
                catch (e) {
                    this.logger.logEvent({ message: 'Error', error: e.message });
                }
                if (!info.data) {
                    yield this.update();
                    info.data = this.data;
                }
                return info.data;
            }
            catch (err) {
                console.log('~~~ Error', err);
                try {
                    yield this.reset();
                }
                catch (e) {
                    this.logger.logEvent({ message: 'Error', error: e.message });
                }
                throw (new Error(`could not start device, reason:${err.message}`));
            }
        }), 5, 1000)
            .then(data => {
            this.startUpdatePull();
            return data;
        });
    }
    startUpdatePull() {
        if (this.iv)
            return;
        this.logger.logEvent({ message: 'start regular device update' });
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
    stop() {
        this.logger.logEvent({ message: 'stop request' });
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.iv) {
                    if (this.iv.sync)
                        clearInterval(this.iv.sync);
                    if (this.iv.update)
                        clearInterval(this.iv.update);
                    this.iv = undefined;
                }
                yield this.waitForClosed();
                this.logger.logEvent({ message: 'stop request completed' });
                this.paused = undefined;
                resolve(true);
            }
            catch (err) {
                this.logger.logEvent({ message: 'stop error', error: err.message });
                this.paused = undefined;
                reject(err);
            }
        }));
    }
    pause() {
        this.logger.logEvent({ message: 'pause' });
        return new Promise(resolve => {
            this.paused = true;
            resolve(true);
        });
    }
    resume() {
        this.logger.logEvent({ message: 'resume' });
        return new Promise(resolve => {
            this.paused = false;
            resolve(true);
        });
    }
    mapData(bikeData) {
        let data = {};
        data.isPedalling = bikeData.cadence > 0;
        data.power = bikeData.power;
        data.pedalRpm = bikeData.cadence;
        data.speed = bikeData.speed;
        data.heartrate = bikeData.heartrate;
        data.distanceInternal = bikeData.distance;
        data.time = bikeData.time;
        return data;
    }
    transformData(internalData, bikeData) {
        let data = {};
        data.heartrate = internalData.heartrate;
        data.timestamp = Date.now();
        data.deviceTime = bikeData.time;
        if (!this.ignoreBike) {
            data.speed = internalData.speed;
            data.power = internalData.power;
            data.cadence = internalData.pedalRpm;
            data.distance = internalData.distanceInternal;
            data.deviceDistanceCounter = bikeData.distance;
        }
        if (this.ignoreHrm)
            delete this.data.heartrate;
        if (this.ignorePower) {
            delete this.data.power;
            delete this.data.cadence;
        }
        return data;
    }
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            this.updateBusy = true;
            this.getStatus()
                .then((bikeData) => {
                this.kettlerData = bikeData;
                let data = this.mapData(bikeData);
                data = this.getCyclingMode().updateData(data);
                this.data = this.transformData(data, bikeData);
                this.updateBusy = false;
            })
                .catch(err => {
                this.logger.logEvent({ message: 'bike update error', error: err.message, stack: err.stack });
                this.updateBusy = false;
            });
        });
    }
    sendRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            this.requestBusy = true;
            try {
                this.logger.logEvent({ message: 'sendRequest', request });
                const isReset = (!request || request.reset || Object.keys(request).length === 0);
                if (isReset) {
                    this.requestBusy = false;
                    return {};
                }
                if (request.slope !== undefined) {
                    this.data.slope = request.slope;
                }
                if (request.targetPower !== undefined) {
                    yield this.setPower(request.targetPower);
                }
                this.requestBusy = false;
                return request;
            }
            catch (err) {
                this.requestBusy = false;
                this.logger.logEvent({ message: 'error', fn: 'sendRequest()', error: err.message || err });
                return;
            }
        });
    }
    sendRequests() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.requests.length > 0) {
                const processing = [...this.requests];
                const cnt = processing.length;
                processing.forEach((request, idx) => __awaiter(this, void 0, void 0, function* () {
                    if (cnt > 1 && idx < cnt - 1) {
                        this.logger.logEvent({ message: 'ignoring bike update request', request });
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
                    this.logger.logEvent({ message: 'bike update error', error: err.message, stack: err.stack, request });
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
            this.logger.logEvent({ message: 'bikeSync' });
            if (!this.ignoreBike) {
                yield this.sendRequests();
            }
            yield this.update();
        });
    }
    sendUpdate(request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.paused)
                return;
            this.logger.logEvent({ message: 'sendUpdate', request, waiting: this.requests.length });
            return yield this.processClientRequest(request);
        });
    }
    sendData() {
        if (this.onDataFn)
            this.onDataFn(this.data);
    }
    refreshRequests() {
        if (this.kettlerData.cadence === 0)
            return;
        let bikeRequest = this.getCyclingMode().sendBikeUpdate({ refresh: true }) || {};
        const prev = this.requests[this.requests.length - 1] || {};
        if (bikeRequest.targetPower !== undefined && bikeRequest.targetPower !== prev.targetPower) {
            this.logger.logEvent({ message: 'add request', request: bikeRequest });
            this.requests.push(bikeRequest);
        }
    }
    processClientRequest(request) {
        if (request.slope !== undefined) {
            this.data.slope = request.slope;
        }
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request);
            this.logger.logEvent({ message: 'add request', request: bikeRequest });
            this.requests.push(bikeRequest);
            resolve(bikeRequest);
        }));
    }
    waitForOpened() {
        return (0, utils_1.runWithRetries)(() => {
            return new Promise((resolve, reject) => {
                try {
                    if (this.comms.isConnected()) {
                        resolve(true);
                        return;
                    }
                    const cleanup = () => {
                        this.comms.removeAllListeners();
                    };
                    const onOpen = () => {
                        resolve(true);
                        cleanup();
                    };
                    const onError = (err) => { reject(err); cleanup(); };
                    const onClose = () => { cleanup(); };
                    this.comms.on('opened', onOpen);
                    this.comms.on('closed', onClose);
                    this.comms.on('error', onError);
                    this.logger.logEvent({ message: 'opening', port: this.getPort() });
                    this.comms.open();
                }
                catch (err) {
                    this.logger.logEvent({ message: 'error', fn: 'waitForOpened()', error: err.message || err });
                    reject(err);
                }
            });
        }, 3, 1000);
    }
    waitForClosed() {
        return new Promise((resolve, reject) => {
            try {
                if (!this.comms.isConnected()) {
                    resolve(true);
                    return;
                }
                const cleanup = () => {
                    this.comms.removeAllListeners();
                };
                const onClose = () => {
                    resolve(true);
                    cleanup();
                };
                const onError = (err) => { reject(err); cleanup(); };
                const onOpen = () => { cleanup(); };
                this.comms.on('closed', onClose);
                this.comms.on('opened', onOpen);
                this.comms.on('error', onError);
                this.logger.logEvent({ message: 'closing', port: this.getPort() });
                this.comms.close();
            }
            catch (err) {
                this.logger.logEvent({ message: 'error', fn: 'waitForClosed()', error: err.message || err });
                reject(err);
            }
        });
    }
    getSupportedCyclingModes() {
        return [power_meter_1.default];
    }
    setCyclingMode(mode, settings) {
        let selectedMode;
        if (typeof mode === 'string') {
            const supported = this.getSupportedCyclingModes();
            const CyclingModeClass = supported.find(M => { const m = new M(this); return m.getName() === mode; });
            if (CyclingModeClass) {
                this.settings.cyclingMode = new CyclingModeClass(this, settings);
                return;
            }
            selectedMode = this.getDefaultCyclingMode();
        }
        else {
            selectedMode = mode;
        }
        this.settings.cyclingMode = selectedMode;
        this.settings.cyclingMode.setSettings(settings);
    }
    getCyclingMode() {
        if (!this.settings.cyclingMode)
            this.setCyclingMode(this.getDefaultCyclingMode());
        return this.settings.cyclingMode;
    }
    getDefaultCyclingMode() {
        return new power_meter_1.default(this);
    }
    setUserSettings(userSettings) {
        this.settings.userSettings = userSettings;
    }
    setBikeSettings(bikeSettings) {
        this.settings.bikeSettings = bikeSettings;
    }
}
exports.default = KettlerRacerAdapter;
