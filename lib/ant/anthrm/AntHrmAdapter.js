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
const DEFAULT_START_TIMEOUT = 5000;
class AntHrmAdapter extends AntAdapter_1.default {
    constructor(DeviceID, port, stick, protocol) {
        super(protocol);
        this.logger = new gd_eventlog_1.EventLogger('Ant+Hrm');
        this.deviceID = DeviceID;
        this.port = port;
        this.stick = stick;
        this.paused = false;
        this.deviceData = {
            DeviceID
        };
        this.data = {};
    }
    isBike() { return false; }
    isHrm() { return true; }
    isPower() { return false; }
    getProfile() {
        return 'Heartrate Monitor';
    }
    getName() {
        return `Ant+Hrm ${this.deviceID}`;
    }
    getDisplayName() {
        const { DeviceID, manID, ComputedHeartRate } = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';
        return `${utils_1.getBrand(manID)} Hrm ${DeviceID}${hrmStr}`;
    }
    onDeviceData(deviceData) {
        this.deviceData = deviceData;
        try {
            if (this.onDataFn && !this.ignoreHrm && !this.paused) {
                if (this.lastUpdate === undefined || (Date.now() - this.lastUpdate) > this.updateFrequency) {
                    this.logger.logEvent({ message: 'onDeviceData', data: deviceData });
                    const data = this.updateData(this.data, deviceData);
                    this.onDataFn(data);
                    this.lastUpdate = Date.now();
                }
            }
        }
        catch (err) {
        }
    }
    updateData(data, deviceData) {
        data.heartrate = deviceData.ComputedHeartRate;
        return data;
    }
    start(props = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: 'start()' });
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                if (this.ignoreHrm)
                    resolve(false);
                const Ant = this.getProtocol().getAnt();
                const protocol = this.getProtocol();
                let start = Date.now();
                let timeout = start + (props.timeout || DEFAULT_START_TIMEOUT);
                const iv = setInterval(() => {
                    if (Date.now() > timeout) {
                        clearInterval(iv);
                        reject(new Error('timeout'));
                    }
                }, 100);
                protocol.attachSensors(this, Ant.HeartRateSensor, 'hbData')
                    .then(() => {
                    clearInterval(iv);
                    resolve(true);
                })
                    .catch(err => reject(err));
            }));
        });
    }
    stop() {
        this.logger.logEvent({ message: 'stop()' });
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (this.ignoreHrm)
                return resolve(false);
            try {
                const protocol = this.getProtocol();
                yield protocol.detachSensor(this);
                resolve(true);
            }
            catch (err) {
                reject(err);
            }
        }));
    }
}
exports.default = AntHrmAdapter;
