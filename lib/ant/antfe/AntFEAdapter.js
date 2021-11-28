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
const gd_eventlog_1 = require("gd-eventlog");
const AntAdapter_1 = __importDefault(require("../AntAdapter"));
const utils_1 = require("../utils");
const utils_2 = require("../../utils");
const floatVal = (d) => d ? parseFloat(d) : d;
const intVal = (d) => d ? parseInt(d) : d;
const hex = (v) => Math.abs(v).toString(16).toUpperCase();
const TIMEOUT_ACK = 5000;
const TIMEOUT_START = 10000;
const TIMEOUT_ATTACH = 3000;
const DEFAULT_USER_WEIGHT = 75;
const DEFAULT_BIKE_WEIGHT = 12.75;
class AntFEAdapter extends AntAdapter_1.default {
    constructor(DeviceID, port, stick, protocol) {
        super(protocol);
        this.logger = new gd_eventlog_1.EventLogger('Ant+FE');
        this.logger.logEvent({ message: 'Ant+FE Adapter created', DeviceID, port });
        this.deviceID = DeviceID;
        this.port = port;
        this.stick = stick;
        this.deviceData = {
            DeviceID
        };
        this.data = {};
        this.started = false;
        this.starting = false;
        this.connected = false;
    }
    isBike() { return true; }
    isHrm() { return this.deviceData.HeartRate !== undefined; }
    isPower() { return true; }
    getProfile() {
        return 'Smart Trainer';
    }
    getName() {
        return `Ant+FE ${this.deviceID}`;
    }
    getDisplayName() {
        const { DeviceID, ManId, ComputedHeartRate } = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';
        return `${utils_1.getBrand(ManId)} FE ${DeviceID}${hrmStr}`;
    }
    onAttached() {
        this.logger.logEvent({ message: 'Device connected' });
        this.connected = true;
    }
    onDeviceData(deviceData) {
        if (!this.started || this.isStopped())
            return;
        this.deviceData = deviceData;
        try {
            if (this.onDataFn && !(this.ignoreHrm && this.ignoreBike && this.ignorePower) && !this.paused) {
                if (!this.lastUpdate || (Date.now() - this.lastUpdate) > this.updateFrequency) {
                    this.logger.logEvent({ message: 'onDeviceData', data: deviceData });
                    this.data = this.updateData(this.data, deviceData);
                    const data = this.transformData(this.data);
                    this.onDataFn(data);
                    this.lastUpdate = Date.now();
                }
            }
        }
        catch (err) {
        }
    }
    onDeviceEvent(data) {
        try {
            const cmdInfo = this.currentCmd;
            if (!cmdInfo)
                return;
            const msg = cmdInfo.msg.readUInt8(2);
            const Constants = this.getProtocol().getAnt().Constants;
            const { expectedResponse } = cmdInfo;
            if (data.message === msg) {
                if (expectedResponse === undefined && data.code === Constants.EVENT_TRANSFER_TX_COMPLETED) {
                    this.currentCmd.response = { success: true, message: hex(data.message), code: hex(data.code) };
                    return;
                }
                if (expectedResponse === undefined && data.code !== Constants.EVENT_TRANSFER_TX_COMPLETED) {
                    this.currentCmd.response = { success: false, message: hex(data.message), code: hex(data.code) };
                    return;
                }
            }
            if (data.message === 1) {
                if (expectedResponse !== undefined && data.code === expectedResponse) {
                    this.currentCmd.response = { success: true, message: hex(data.message), code: hex(data.code) };
                    return;
                }
                if (expectedResponse === undefined && (data.code === Constants.EVENT_TRANSFER_TX_COMPLETED || data.code === 3)) {
                    this.currentCmd.response = { success: true, message: hex(data.message), code: hex(data.code) };
                    return;
                }
                if (data.code === Constants.EVENT_TRANSFER_TX_FAILED) {
                    this.stick.write(this.currentCmd.msg);
                    this.currentCmd.response = { success: false, message: hex(data.message), code: hex(data.code) };
                    return;
                }
            }
            if (this.currentCmd !== undefined && data.message === Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA && data.code === 31) {
                this.logger.log("could not send (TRANSFER_IN_PROGRESS)");
                return;
            }
            this.logger.logEvent({ message: "Incoming Event ", event: { message: hex(data.message), code: hex(data.code) } });
        }
        catch (err) {
            this.logger.logEvent({ message: 'Error', fn: 'parseEvent', event: { message: hex(data.message), code: hex(data.code) }, error: err.message || err });
        }
    }
    updateData(data, deviceData) {
        if (data.distanceOffs === undefined)
            data.distanceOffs = 0;
        data.speed = (deviceData.VirtualSpeed !== undefined ? deviceData.VirtualSpeed : deviceData.RealSpeed) * 3.6;
        data.slope = (deviceData.Incline !== undefined ? deviceData.Incline : data.slope);
        data.power = (deviceData.InstantaneousPower !== undefined ? deviceData.InstantaneousPower : data.power);
        data.pedalRpm = (deviceData.Cadence !== undefined ? deviceData.Cadence : data.pedalRpm);
        data.heartrate = (deviceData.HeartRate !== undefined ? deviceData.HeartRate : data.heartrate);
        if (deviceData.Distance !== undefined && deviceData.Distance !== 0) {
            data.distanceInternal = deviceData.Distance - data.distanceOffs;
            data.distance = data.distanceInternal / 1000;
        }
        else {
            if (this.lastUpdate && deviceData.Cadence !== undefined && deviceData.Cadence > 0 && data.speed) {
                const t = (Date.now() - this.lastUpdate) / 1000;
                const prevDistance = data.distanceInternal || 0;
                data.distanceInternal = Math.round(data.speed / 3.6 * t) + prevDistance;
                data.distance = data.distanceInternal / 1000;
            }
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
        if (this.ignorePower) {
            delete data.power;
            delete data.cadence;
        }
        if (this.ignoreBike) {
            data = { heartrate: data.heartrate };
        }
        if (this.ignoreHrm)
            delete data.heartrate;
        return data;
    }
    start(props) {
        const _super = Object.create(null, {
            start: { get: () => super.start }
        });
        return __awaiter(this, void 0, void 0, function* () {
            yield _super.start.call(this, props);
            this.logger.logEvent({ message: 'start()' });
            const args = props || {};
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                if (this.ignoreHrm && this.ignoreBike && this.ignorePower) {
                    this.logger.logEvent({ message: 'start() not done: bike disabled' });
                    return resolve(false);
                }
                if (this.starting) {
                    this.logger.logEvent({ message: 'start() not done: bike starting' });
                    return resolve(false);
                }
                if (this.started) {
                    this.logger.logEvent({ message: 'start() done: bike was already started' });
                    this.startWorker();
                    return resolve(true);
                }
                this.starting = true;
                const Ant = this.getProtocol().getAnt();
                const protocol = this.getProtocol();
                let start = Date.now();
                let timeout = start + (args.timeout || TIMEOUT_ATTACH);
                const ivAttach = setInterval(() => {
                    if (Date.now() > timeout) {
                        clearInterval(ivAttach);
                        this.starting = false;
                        reject(new Error('timeout'));
                    }
                    if (this.isStopped()) {
                        clearInterval(ivAttach);
                        this.starting = false;
                        reject(new Error('stopped'));
                    }
                }, 100);
                try {
                    if (!this.connected) {
                        this.logger.logEvent({ message: 'attach device ...' });
                        yield protocol.attachSensors(this, Ant.FitnessEquipmentSensor, 'fitnessData');
                    }
                    clearInterval(ivAttach);
                    this.startWorker();
                    const tsStart = Date.now();
                    const iv = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                        if (this.connected) {
                            clearInterval(iv);
                            let status = {
                                trackResistanceSent: false,
                                userSent: false,
                            };
                            utils_2.runWithRetries(() => __awaiter(this, void 0, void 0, function* () {
                                if (this.isStopped())
                                    resolve(false);
                                try {
                                    if (!status.trackResistanceSent) {
                                        yield this.sendTrackResistance(0.0);
                                        status.trackResistanceSent = true;
                                    }
                                    if (!status.userSent) {
                                        yield this.sendUserConfiguration(args.userWeight || DEFAULT_USER_WEIGHT, args.bikeWeight || DEFAULT_BIKE_WEIGHT, args.wheelDiameter, args.gearRatio);
                                        status.userSent = true;
                                    }
                                    this.started = true;
                                    this.starting = false;
                                    resolve(true);
                                }
                                catch (err) {
                                    throw (new Error(`could not start device, reason:${err.message || err}`));
                                }
                            }), 5, 1500)
                                .catch(err => {
                                this.logger.logEvent({ message: 'start() error', error: err.message || err });
                                this.starting = false;
                                reject(err);
                            });
                        }
                        else if ((Date.now() - tsStart) > TIMEOUT_START) {
                            clearInterval(iv);
                            try {
                                yield protocol.detachSensor(this);
                            }
                            catch (err) { }
                            this.started = false;
                            this.starting = false;
                            reject(new Error('could not start device, reason:timeout'));
                        }
                    }), 50);
                }
                catch (err) {
                    this.logger.logEvent({ message: 'start() error', error: err.message });
                    this.starting = false;
                    reject(new Error(`could not start device, reason:${err.message}`));
                }
            }));
        });
    }
    stop() {
        const _super = Object.create(null, {
            stop: { get: () => super.stop }
        });
        return __awaiter(this, void 0, void 0, function* () {
            yield _super.stop.call(this);
            this.logger.logEvent({ message: 'stop()' });
            this.stopWorker();
            const Messages = this.getProtocol().getAnt().Messages;
            const stick = this.stick;
            const channel = this.channel;
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                this.starting = false;
                return resolve(true);
                if (!this.started && !this.connected)
                    return resolve(false);
                try {
                    stick.write(Messages.openChannel(channel));
                    const protocol = this.getProtocol();
                    yield protocol.detachSensor(this);
                    this.started = false;
                    this.connected = false;
                    this.logger.logEvent({ message: 'stop() finished' });
                    resolve(true);
                }
                catch (err) {
                    this.connected = false;
                    this.logger.logEvent({ message: 'stop() error', error: err.message });
                    reject(err);
                }
            }));
        });
    }
    sendUpdate(request) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: "sendBikeUpdate():", request });
            try {
                const isReset = (!request || request.reset || Object.keys(request).length === 0);
                if (request.slope !== undefined) {
                    yield utils_2.runWithRetries(() => __awaiter(this, void 0, void 0, function* () { return yield this.sendTrackResistance(request.slope); }), 2, 100);
                }
                if (request.targetPower !== undefined) {
                    yield utils_2.runWithRetries(() => __awaiter(this, void 0, void 0, function* () { return yield this.sendTargetPower(request.targetPower); }), 2, 100);
                }
                else if (request.maxPower !== undefined) {
                    if (this.data.power && this.data.power > request.maxPower)
                        yield this.sendTargetPower(request.maxPower);
                }
                else if (request.minPower !== undefined) {
                    if (this.data.power && this.data.power < request.minPower)
                        yield this.sendTargetPower(request.minPower);
                }
                if (request.maxHrm !== undefined) {
                }
                if (request.minHrm !== undefined) {
                }
            }
            catch (err) {
                this.logger.logEvent({ message: 'sendBikeUpdate() error', error: err.message });
            }
        });
    }
    send(msg, logStr, callback, expectedResponse) {
        if (this.workerId === undefined) {
            return;
        }
        this.queue.enqueue({ msg, logStr, callback, expectedResponse });
    }
    sendAsync(msg, logStr, expectedResponse) {
        return new Promise((resolve, reject) => {
            this.send(msg, logStr, (res, err) => {
                if (err)
                    return reject(err);
                resolve(res);
            }, expectedResponse);
        });
    }
    startWorker() {
        this.logger.logEvent({ message: 'startWorker()' });
        if (this.queue === undefined) {
            this.queue = new utils_2.Queue();
        }
        if (this.workerId)
            return;
        this.workerId = setInterval(() => {
            try {
                this.sendFromQueue();
            }
            catch (err) {
                this.logger.logEvent({ message: 'sendFromQueue error', error: err.message });
            }
        }, 10);
    }
    stopWorker() {
        if (!this.workerId)
            return;
        clearInterval(this.workerId);
        this.queue.clear();
        this.workerId = undefined;
    }
    sendFromQueue() {
        if (this.queue === undefined) {
            return;
        }
        if (this.currentCmd !== undefined) {
            const cmdInfo = this.currentCmd;
            if (this.currentCmd.response === undefined) {
                const { callback, logStr, tsStart } = cmdInfo;
                let timeout = cmdInfo.timeout;
                if (timeout === undefined)
                    timeout = TIMEOUT_ACK;
                let duration = Date.now() - tsStart;
                if (duration > timeout) {
                    this.logger.logEvent({ message: 'timeout', cmd: logStr, timeout: `${timeout}ms` });
                    this.currentCmd = undefined;
                    if (callback !== undefined) {
                        callback(undefined, new Error('timeout'));
                    }
                }
            }
            else {
                const { callback, response, logStr } = cmdInfo;
                this.logger.logEvent({ message: "response: ", cmd: logStr, response });
                this.currentCmd = undefined;
                if (callback !== undefined) {
                    if (response && response.success === false) {
                        callback(undefined, new Error(`ANT error ${response.code}`));
                        return;
                    }
                    callback(response);
                }
            }
        }
        else {
            if (this.queue.isEmpty())
                return;
            this.currentCmd = this.queue.dequeue();
            this.currentCmd.tsStart = Date.now();
            const { msg, logStr } = this.currentCmd;
            this.logger.logEvent({ message: "sending", cmd: logStr, msg: utils_2.hexstr(msg), queueSize: this.queue.size() });
            if (this.stick)
                this.stick.write(msg);
        }
    }
    sendUserConfiguration(userWeight, bikeWeight, wheelDiameter, gearRatio) {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                reject(new Error('not connected'));
            if (!this.queue)
                this.startWorker();
            var payload = [];
            payload.push(this.channel);
            const logStr = `sendUserConfiguration(${userWeight},${bikeWeight},${wheelDiameter},${gearRatio})`;
            var m = userWeight === undefined ? 0xFFFF : userWeight;
            var mb = bikeWeight === undefined ? 0xFFF : bikeWeight;
            var d = wheelDiameter === undefined ? 0xFF : wheelDiameter;
            var gr = gearRatio === undefined ? 0x00 : gearRatio;
            var dOffset = 0xFF;
            if (m !== 0xFFFF)
                m = Math.trunc(m * 100);
            if (mb !== 0xFFF)
                mb = Math.trunc(mb * 20);
            if (d !== 0xFF) {
                d = d * 1000;
                dOffset = d % 10;
                d = Math.trunc(d / 10);
            }
            if (gr !== 0x00) {
                gr = Math.trunc(gr / 0.03);
            }
            payload.push(0x37);
            payload.push(m & 0xFF);
            payload.push((m >> 8) & 0xFF);
            payload.push(0xFF);
            payload.push(((mb & 0xF) << 4) | (dOffset & 0xF));
            payload.push((mb >> 4) & 0xF);
            payload.push(d & 0xFF);
            payload.push(gr & 0xFF);
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
            this.send(msg, logStr, (res, err) => {
                if (err)
                    return reject(err);
                resolve(res);
            });
        });
    }
    sendBasicResistance(resistance) {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                reject(new Error('not connected'));
            if (!this.queue)
                this.startWorker();
            var payload = [];
            payload.push(this.channel);
            const logStr = `sendBasicResistance(${resistance})`;
            var res = resistance === undefined ? 0 : resistance;
            res = res / 0.5;
            payload.push(0x30);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(res & 0xFF);
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
            this.send(msg, logStr, (res, err) => {
                if (err)
                    return reject(err);
                resolve(res);
            });
        });
    }
    sendTargetPower(power) {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                reject(new Error('not connected'));
            if (!this.queue)
                this.startWorker();
            var payload = [];
            payload.push(this.channel);
            const logStr = `sendTargetPower(${power})`;
            var p = power === undefined ? 0x00 : power;
            p = p * 4;
            payload.push(0x31);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(p & 0xFF);
            payload.push((p >> 8) & 0xFF);
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
            this.send(msg, logStr, (res, err) => {
                if (err)
                    return reject(err);
                resolve(res);
            });
        });
    }
    sendWindResistance(windCoeff, windSpeed, draftFactor) {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                reject(new Error('not connected'));
            if (!this.queue)
                this.startWorker();
            var payload = [];
            payload.push(this.channel);
            const logStr = `sendWindResistance(${windCoeff},${windSpeed},${draftFactor})`;
            var wc = windCoeff === undefined ? 0xFF : windCoeff;
            var ws = windSpeed === undefined ? 0xFF : windSpeed;
            var df = draftFactor === undefined ? 0xFF : draftFactor;
            if (wc !== 0xFF) {
                wc = Math.trunc(wc / 0.01);
            }
            if (ws !== 0xFF) {
                ws = Math.trunc(ws + 127);
            }
            if (df !== 0xFF) {
                df = Math.trunc(df / 0.01);
            }
            payload.push(0x32);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(wc & 0xFF);
            payload.push(ws & 0xFF);
            payload.push(df & 0xFF);
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
            this.send(msg, logStr, (res, err) => {
                if (err)
                    return reject(err);
                resolve(res);
            });
        });
    }
    sendTrackResistance(slope, rrCoeff) {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                reject(new Error('not connected'));
            if (!this.queue)
                this.startWorker();
            var payload = [];
            payload.push(this.channel);
            const logStr = `sendTrackResistance(${slope},${rrCoeff})`;
            var s = slope === undefined ? 0xFFFF : slope;
            var rr = rrCoeff === undefined ? 0xFF : rrCoeff;
            if (s !== 0xFFFF) {
                s = Math.trunc((s + 200) / 0.01);
            }
            if (rr !== 0xFF) {
                rr = Math.trunc(rr / 0.00005);
            }
            payload.push(0x33);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(0xFF);
            payload.push(s & 0xFF);
            payload.push((s >> 8) & 0xFF);
            payload.push(rr & 0xFF);
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
            this.send(msg, logStr, (res, err) => {
                if (err)
                    return reject(err);
                resolve(res);
            });
        });
    }
}
exports.default = AntFEAdapter;
