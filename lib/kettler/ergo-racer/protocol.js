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
const DeviceProtocol_1 = __importStar(require("../../DeviceProtocol"));
const gd_eventlog_1 = require("gd-eventlog");
const DeviceRegistry_1 = __importDefault(require("../../DeviceRegistry"));
const adapter_1 = __importDefault(require("./adapter"));
const PROTOCOL_NAME = 'Kettler Racer';
var ScanState;
(function (ScanState) {
    ScanState[ScanState["IDLE"] = 0] = "IDLE";
    ScanState[ScanState["SCANNING"] = 1] = "SCANNING";
    ScanState[ScanState["STOPPING"] = 2] = "STOPPING";
    ScanState[ScanState["STOPPED"] = 3] = "STOPPED";
})(ScanState || (ScanState = {}));
class KettlerRacerProtocol extends DeviceProtocol_1.default {
    constructor() {
        super();
        this.state = ScanState.IDLE;
        this.logger = new gd_eventlog_1.EventLogger('KettlerRacer');
        this.activeScans = [];
        this.devices = [];
    }
    getSerialPort() {
        return DeviceProtocol_1.default.getSerialPort();
    }
    getInterfaces() {
        return [DeviceProtocol_1.INTERFACE.SERIAL];
    }
    getName() {
        return PROTOCOL_NAME;
    }
    isBike() {
        return true;
    }
    isHrm() {
        return true;
    }
    isPower() {
        return true;
    }
    add(settings) {
        this.logger.logEvent({ message: 'adding device', settings });
        if (this.devices.length > 0) {
            const found = this.devices.find(d => d.getPort() === settings.port);
            if (found)
                return found;
        }
        let device = new adapter_1.default(this, settings);
        this.devices.push(device);
        return device;
    }
    scan(props) {
        this.logger.logEvent({ message: 'start scan', id: props.id, port: props.port });
        this.state = ScanState.SCANNING;
        const isAlreadyKnownOrScanning = this.checkDevice(props.port);
        if (!isAlreadyKnownOrScanning) {
            const port = props.port;
            const name = PROTOCOL_NAME;
            const device = new adapter_1.default(this, { name, port });
            const iv = setInterval(() => { this.doScan(port); }, 1000);
            this.activeScans.push({ iv, device, port, state: ScanState.IDLE, props });
        }
    }
    checkDevice(port) {
        if (this.devices.length > 0 && this.devices.findIndex(d => d.getPort() === port) >= 0)
            return true;
        if (this.activeScans.length > 0 && this.activeScans.findIndex(d => d.port === port) >= 0)
            return true;
        return false;
    }
    doScan(port) {
        const job = this.activeScans.find(d => d.port === port);
        if (!job)
            return;
        if (this.state === ScanState.STOPPING || job.state === ScanState.STOPPING)
            return;
        const device = job.device;
        if (device && (device.isDetected() || device.isSelected()))
            return;
        this.state = ScanState.SCANNING;
        job.state = ScanState.SCANNING;
        return device.check()
            .then((found) => __awaiter(this, void 0, void 0, function* () {
            if (found) {
                if (this.state === ScanState.STOPPING || this.state === ScanState.STOPPED)
                    return;
                const { onDeviceFound, onScanFinished, id } = job.props;
                device.setDetected();
                if (onDeviceFound)
                    onDeviceFound(device, device.getProtocol());
                if (onScanFinished) {
                    onScanFinished(id);
                }
            }
            job.state = ScanState.STOPPED;
            try {
                yield device.waitForClosed();
            }
            catch (err) {
                this.logger.logEvent({ message: 'scanCommand warning: Could not close port', error: err.message });
            }
            clearInterval(job.iv);
            job.iv = null;
            job.state = ScanState.STOPPED;
            const idxActiveScan = this.activeScans.findIndex(d => d.state !== ScanState.STOPPED);
            if (idxActiveScan === -1) {
                this.state = ScanState.STOPPED;
            }
        }))
            .catch(() => {
            job.state = ScanState.STOPPED;
        });
    }
    doStopScan(job) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!job)
                return;
            if (job.state === ScanState.STOPPING || job.state === ScanState.STOPPED)
                return;
            job.state = ScanState.STOPPING;
            clearInterval(job.iv);
            job.iv = null;
        });
    }
    isJobStopped(job) {
        return job.state === ScanState.STOPPED && !job.iv;
    }
    waitForStop(timeout) {
        return new Promise((resolve) => {
            let timedOut = false;
            if (timeout)
                setTimeout(() => { timedOut = true; }, timeout);
            const iv = setInterval(() => {
                const idxActiveScan = this.activeScans.findIndex(d => this.isJobStopped(d) === false);
                if (idxActiveScan === -1) {
                    clearInterval(iv);
                    resolve(true);
                    return;
                }
                if (timedOut) {
                    clearInterval(iv);
                    resolve(false);
                    return;
                }
            }, 500);
        });
    }
    stopScan() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state === ScanState.STOPPING || this.state === ScanState.STOPPED)
                return;
            this.state = ScanState.STOPPING;
            this.logger.logEvent({ message: 'stop scan', activeScans: this.activeScans.map(j => j.port) });
            this.activeScans.forEach(job => this.doStopScan(job));
            const stopped = yield this.waitForStop();
            if (!stopped) {
                this.logger.logEvent({ message: 'scanCommand warning: stop scan timeout' });
            }
            else {
                this.logger.logEvent({ message: 'stop scan completed' });
            }
            this.activeScans = [];
            this.state = ScanState.IDLE;
            return true;
        });
    }
    isScanning() {
        return this.state === ScanState.SCANNING;
    }
}
exports.default = KettlerRacerProtocol;
DeviceRegistry_1.default.register(new KettlerRacerProtocol());
