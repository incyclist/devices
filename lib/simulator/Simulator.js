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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Simulator = void 0;
const DeviceProtocol_1 = __importStar(require("../DeviceProtocol"));
const DeviceRegistry_1 = __importDefault(require("../DeviceRegistry"));
const Device_1 = __importDefault(require("../Device"));
const gd_eventlog_1 = require("gd-eventlog");
const calculations_1 = __importDefault(require("../calculations"));
class Simulator extends Device_1.default {
    constructor(protocol) {
        const proto = protocol || DeviceRegistry_1.default.findByName('Simulator');
        super(proto);
        this.logger = new gd_eventlog_1.EventLogger(Simulator.NAME);
        this.speed = 0;
        this.power = 0;
        this.cadence = 90;
        this.paused = undefined;
        this.time = undefined;
        this.iv = undefined;
        this.started = false;
        this.slope = 0;
        this.limit = {};
    }
    isBike() { return true; }
    isHrm() { return false; }
    isPower() { return true; }
    getID() { return Simulator.NAME; }
    getName() { return Simulator.NAME; }
    getPort() { return 'local'; }
    start(props) {
        this.startProps = props;
        return new Promise((resolve) => {
            this.logger.logEvent({ message: 'start', iv: this.iv });
            if (this.started) {
                return resolve({ started: true, error: undefined });
            }
            this.paused = (this.speed === 0);
            this.started = true;
            this.time = Date.now();
            if (this.iv !== undefined) {
                clearInterval(this.iv);
                this.iv = undefined;
            }
            this.speed = 30;
            this.iv = setInterval(() => this.update(), 1000);
            resolve({ started: true, error: undefined });
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            this.logger.logEvent({ message: 'stop', iv: this.iv });
            this.started = false;
            clearInterval(this.iv);
            this.iv = undefined;
            this.paused = undefined;
            resolve(true);
        });
    }
    pause() {
        return new Promise((resolve, reject) => {
            if (!this.started)
                return reject(new Error('illegal state - pause() has been called before start()'));
            this.logger.logEvent({ message: 'pause', iv: this.iv });
            this.paused = true;
            resolve(true);
        });
    }
    resume() {
        return new Promise((resolve, reject) => {
            if (!this.started)
                reject(new Error('illegal state - resume() has been called before start()'));
            this.logger.logEvent({ message: 'resume', iv: this.iv });
            this.paused = false;
            resolve(true);
        });
    }
    toggle() {
        if (this.started) {
            return this.stop();
        }
        else {
            return this.start().then(() => { return true; });
        }
    }
    faster() {
        if (this.speed < 15)
            this.speed += 5;
        else if (this.speed < 30)
            this.speed += 3;
        else
            this.speed += 1;
        if (this.paused && this.speed > 0)
            this.paused = false;
    }
    slower() {
        if (this.speed <= 15)
            this.speed -= 5;
        else if (this.speed <= 30)
            this.speed -= 3;
        else
            this.speed -= 1;
        if (this.speed <= 0) {
            this.speed = 0;
            this.pause();
        }
    }
    update() {
        let prevTime = this.time;
        this.time = Date.now();
        let timespan = this.time - prevTime;
        if (this.limit.slope) {
            this.slope = this.limit.slope;
        }
        if (this.speed === undefined)
            this.speed = 30;
        this.power = calculations_1.default.calculatePower(75, this.speed / 3.6, this.slope);
        if (this.limit.targetPower) {
            this.power = this.limit.targetPower;
            this.speed = calculations_1.default.calculateSpeed(75, this.power, this.slope);
        }
        if (this.limit.maxPower && this.power > this.limit.maxPower) {
            this.power = this.limit.maxPower;
            this.speed = calculations_1.default.calculateSpeed(75, this.power, this.slope);
        }
        else if (this.limit.minPower && this.power < this.limit.minPower) {
            this.power = this.limit.minPower;
            this.speed = calculations_1.default.calculateSpeed(75, this.power, this.slope);
        }
        let distance = this.calculateDistance(this.speed, timespan / 1000);
        let data = { speed: this.speed, cadence: Math.round(this.cadence), power: Math.round(this.power), timespan, distance };
        if (this.onDataFn) {
            this.onDataFn(data);
        }
    }
    calculateDistance(speedKps, timeS) {
        return timeS * speedKps / 3.6;
    }
    sendUpdate(request) {
        this.logger.logEvent({ message: 'bike update request', request });
        const r = request || { refresh: true };
        if (r.refresh) {
            if (Object.keys(r).length === 1)
                return this.limit;
            delete r.refresh;
        }
        this.limit = r;
        return this.limit;
    }
}
exports.Simulator = Simulator;
Simulator.NAME = 'Simulator';
class SimulatorProtocol extends DeviceProtocol_1.default {
    constructor() {
        super();
        this.devices.push(new Simulator(this));
    }
    add(settings) {
    }
    getName() {
        return SimulatorProtocol.NAME;
    }
    getInterfaces() {
        return [DeviceProtocol_1.INTERFACE.SIMULATOR];
    }
    isBike() {
        return true;
    }
    isHrm() {
        return false;
    }
    isPower() {
        return true;
    }
    getDevices() {
        return this.devices;
    }
}
exports.default = SimulatorProtocol;
SimulatorProtocol.NAME = 'Simulator';
const simulator = new SimulatorProtocol();
DeviceRegistry_1.default.register(simulator);
