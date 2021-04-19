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
const bike_1 = require("../premium/bike");
const DaumPremiumAdapter_1 = __importDefault(require("./DaumPremiumAdapter"));
const gd_eventlog_1 = require("gd-eventlog");
const PROTOCOL_NAME = "Daum Premium";
const DefaultState = {
    activeScans: [],
    scanning: false,
    stopScanning: false
};
class DaumPremiumProtocol extends DeviceProtocol_1.default {
    constructor() {
        super();
        this.state = DefaultState;
        this.logger = new gd_eventlog_1.EventLogger('DaumPremium');
        this.devices = [];
    }
    getName() {
        return PROTOCOL_NAME;
    }
    getInterfaces() {
        return [DeviceProtocol_1.INTERFACE.SERIAL, DeviceProtocol_1.INTERFACE.TCPIP];
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
        const opts = props || {};
        this.logger.logEvent({ message: 'start scan', opts });
        if (opts.interface === DeviceProtocol_1.INTERFACE.TCPIP) {
            this.scanTcpip(opts);
        }
        else if (opts.interface === DeviceProtocol_1.INTERFACE.SERIAL) {
            this.scanSerial(opts);
        }
    }
    addDevice(DeviceClass, opts, portName) {
        let device;
        if (this.devices.length === 0) {
            const bike = new DeviceClass(opts);
            device = new DaumPremiumAdapter_1.default(this, bike);
            this.devices.push(device);
        }
        else {
            const devices = this.devices;
            const idx = devices.findIndex(d => d.getBike().getPort() === portName);
            if (idx === -1) {
                const bike = new DeviceClass(opts);
                device = new DaumPremiumAdapter_1.default(this, bike);
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
    scanTcpip(opts) {
        bike_1.Daum8iTcp.setNetImpl(DeviceProtocol_1.default.getNetImpl());
        const { host, port } = opts;
        let device = this.addDevice(bike_1.Daum8iTcp, opts, `${host}:${port || 51955}`);
        if (device) {
            const iv = setInterval(() => { this.scanCommand(device, opts); }, 500);
            this.state.activeScans.push({ iv, device });
        }
    }
    scanSerial(opts) {
        bike_1.Daum8iSerial.setSerialPort(DeviceProtocol_1.default.getSerialPort());
        let device = this.addDevice(bike_1.Daum8iSerial, opts, opts.port);
        if (device) {
            const iv = setInterval(() => { this.scanCommand(device, opts); }, 500);
            this.state.activeScans.push({ iv, device });
        }
    }
    stopScan() {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: 'stop scan', activeScans: this.state.activeScans });
            this.state.stopScanning = true;
            if (this.state.activeScans.length > 0) {
                this.state.activeScans.forEach(scan => {
                    clearInterval(scan.iv);
                    scan.iv = undefined;
                    scan.scanning = false;
                });
                this.state.activeScans = [];
            }
            const devices = this.devices;
            for (let i = 0; i < devices.length; i++) {
                const d = devices[i];
                if (!d.isSelected() && !d.isDetected()) {
                    try {
                        yield d.getBike().saveClose(true);
                    }
                    catch (err) {
                        this.logger.logEvent({ message: 'stop scan error', error: err.message });
                    }
                }
            }
            for (let i = 0; i < devices.length; i++) {
                const d = devices[i];
                if (!d.isSelected() && !d.isDetected()) {
                    try {
                        yield d.getBike().unblock();
                    }
                    catch (err) {
                    }
                }
            }
            this.state.scanning = false;
            this.state.stopScanning = false;
            this.logger.logEvent({ message: 'stop scan completed' });
            return true;
        });
    }
    scanCommand(device, opts) {
        const scan = this.state.activeScans.find(actScan => actScan.device.getBike().getPort() === device.getBike().getPort());
        if (this.state.stopScanning || (scan && scan.scanning) || device.isDetected())
            return;
        scan.scanning = true;
        device.check()
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
exports.default = DaumPremiumProtocol;
const premium = new DaumPremiumProtocol();
DeviceRegistry_1.default.register(premium);
