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
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
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
const DeviceRegistry_1 = __importDefault(require("../../DeviceRegistry"));
const bike_1 = __importDefault(require("./bike"));
const DaumClassicAdapter_1 = __importDefault(require("./DaumClassicAdapter"));
const gd_eventlog_1 = require("gd-eventlog");
const PROTOCOL_NAME = "Daum Classic";
const DefaultState = {
    activeScans: [],
    scanning: false,
    stopScanning: false
};
class DaumClassicProtocol extends DeviceProtocol_1.default {
    constructor() {
        super();
        this.state = DefaultState;
        this.logger = new gd_eventlog_1.EventLogger('DaumClassic');
        this.devices = [];
    }
    getName() {
        return PROTOCOL_NAME;
    }
    getInterfaces() {
        return [DeviceProtocol_1.INTERFACE.SERIAL];
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
    scan(props) {
        this.logger.logEvent({ message: 'start scan', id: props.id, port: props.port });
        bike_1.default.setSerialPort(DeviceProtocol_1.default.getSerialPort());
        this.state.scanning = true;
        let device = this.addDevice(props, props.port);
        if (device) {
            const iv = setInterval(() => { this.scanCommand(device, props); }, 500);
            this.state.activeScans.push({ iv, device, props });
        }
    }
    addDevice(opts, portName) {
        let device;
        if (this.devices.length === 0) {
            const bike = new bike_1.default(opts);
            device = new DaumClassicAdapter_1.default(this, bike);
            this.devices.push(device);
        }
        else {
            const devices = this.devices;
            const idx = devices.findIndex(d => d.getBike().getPort() === portName);
            if (idx === -1) {
                const bike = new bike_1.default(opts);
                device = new DaumClassicAdapter_1.default(this, bike);
                this.devices.push(device);
            }
            else {
                device = this.devices[idx];
                if (device.isSelected() || device.isDetected())
                    device = undefined;
            }
        }
        return device;
    }
    stopScan() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state.stopScanning)
                return;
            this.state.stopScanning = true;
            this.logger.logEvent({ message: 'stop scan', activeScans: this.state.activeScans });
            const stopRequired = [];
            if (this.state.activeScans.length > 0) {
                this.state.activeScans.forEach(scan => {
                    stopRequired.push(scan.scanning);
                    clearInterval(scan.iv);
                    scan.iv = undefined;
                    scan.scanning = false;
                });
            }
            for (let i = 0; i < this.state.activeScans.length; i++) {
                const as = this.state.activeScans[i];
                const toStop = stopRequired[i];
                const d = as.device;
                if (!d.isSelected() && !d.isDetected()) {
                    try {
                        yield d.close();
                    }
                    catch (err) {
                        this.logger.logEvent({ message: 'stop scan error', error: err.message });
                    }
                }
                if (toStop) {
                    const { id, onScanFinished } = as.props;
                    if (onScanFinished)
                        onScanFinished(id);
                }
            }
            this.state.activeScans = [];
            this.state.scanning = false;
            this.state.stopScanning = false;
            this.logger.logEvent({ message: 'stop scan completed' });
            return true;
        });
    }
    isScanning() {
        return this.state.scanning;
    }
    scanCommand(device, opts) {
        const scan = this.state.activeScans.find(actScan => actScan.device.getBike().getPort() === device.getBike().getPort());
        if (this.state.stopScanning || (scan && scan.scanning) || device.isDetected())
            return;
        scan.scanning = true;
        return device.check()
            .then(() => {
            if (this.state.stopScanning)
                return;
            const { onDeviceFound, onScanFinished, id } = opts;
            device.setDetected();
            if (onDeviceFound)
                onDeviceFound(device, device.getProtocol());
            if (onScanFinished) {
                onScanFinished(id);
            }
            clearInterval(scan.iv);
            scan.iv = undefined;
            scan.scanning = false;
        })
            .catch(() => {
            scan.scanning = false;
        });
    }
}
exports.default = DaumClassicProtocol;
DeviceRegistry_1.default.register(new DaumClassicProtocol());
