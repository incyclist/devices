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
exports.AntScanner = exports.AntProtocol = void 0;
const gd_eventlog_1 = require("gd-eventlog");
const DeviceProtocol_1 = __importStar(require("../DeviceProtocol"));
const AntHrmAdapter_1 = __importDefault(require("./anthrm/AntHrmAdapter"));
const AntFEAdapter_1 = __importDefault(require("./antfe/AntFEAdapter"));
const LOGGER_NAME = 'ANT+Scanner';
const DEFAULT_SCAN_TIMEOUT = 30000;
const TIMEOUT_STARTUP = 3000;
const hex = (n, len) => {
    const c = "0";
    let s = n.toString(16);
    if (s.length < len)
        return `0x${c.repeat(len - s.length)}${s}`;
    return `0x${s}`;
};
class AntProfile {
    constructor(profile, AntScannerClass, stick, message, onNewDevice, onData) {
        if (process.env.ANT_PROFILE_DEBUG)
            console.log('adding profile', profile, AntScannerClass, message, onNewDevice, onData);
        this.ids = [];
        this.scanner = new AntScannerClass(stick);
        this.scanner.on(message, data => {
            try {
                if (process.env.ANT_PROFILE_DEBUG)
                    console.log(data);
                if (data.DeviceID) {
                    if (this.ids.find(id => id === data.DeviceID)) {
                        if (onData)
                            onData(profile, data.DeviceID, data);
                        return;
                    }
                    this.ids.push(data.DeviceID);
                    if (onNewDevice)
                        onNewDevice(profile, data.DeviceID);
                }
            }
            catch (err) {
            }
        });
    }
    getScanner() {
        return this.scanner;
    }
    getProfile() {
        return this.profile;
    }
}
class AntProtocol extends DeviceProtocol_1.default {
    constructor(antClass) {
        super();
        this.logger = new gd_eventlog_1.EventLogger(LOGGER_NAME);
        this.ant = antClass;
        this.activeScans = {};
        this.sensors = {};
        this.sticks = [];
        this.profiles = [
            { name: 'Heartrate Monitor', Adapter: AntHrmAdapter_1.default },
            { name: 'Smart Trainer', Adapter: AntFEAdapter_1.default }
        ];
    }
    getAnt() {
        return this.ant || DeviceProtocol_1.default.getAnt();
    }
    getName() { return 'Ant'; }
    getInterfaces() { return [DeviceProtocol_1.INTERFACE.ANT]; }
    isBike() { return true; }
    isHrm() { return true; }
    isPower() { return true; }
    isScanning() { return Object.keys(this.activeScans).length > 0; }
    getSupportedProfiles() {
        return this.profiles.map(i => i.name);
    }
    getUSBDeviceInfo(d) {
        if (!d)
            return;
        return ({
            port: `usb:${d.busNumber}-${d.deviceAddress}`,
            vendor: d.deviceDescriptor.idVendor,
            product: d.deviceDescriptor.idProduct,
            inUse: d.inUse
        });
    }
    getStickInfo(sticks) {
        const isStick = i => {
            return (i && i.vendor === 0x0FCF && (i.product === 0x1008 || i.product === 0x1009));
        };
        const inUse = i => i && i.inUse;
        return sticks
            .map(d => this.getUSBDeviceInfo(d))
            .reduce((r, i) => r + `${r === '' ? '' : ','}[${i.port} ${hex(i.vendor, 4)} ${hex(i.product, 4)}${isStick(i) ? '*' : ''}${inUse(i) ? 'x' : ''}]`, '');
    }
    findStickByPort(port) {
        const info = this.sticks.find(i => i.port === port);
        if (info)
            return info.stick;
    }
    logStickInfo() {
        const sticks = this.ant.getSticks();
        const info = this.getStickInfo(sticks);
        this.logger.logEvent({ message: 'stick info', info });
    }
    getDetailedStickInfo(stick) {
        const devices = stick.getDevices();
        if (devices.length > 0) {
            const device = devices[0];
            try {
                const config = JSON.parse(JSON.stringify(device.configDescriptor));
                const interfaces = config ? config.interfaces : [];
                delete config.interfaces;
                this.logger.logEvent({ message: 'USB DeviceConfig', config, interfaces });
            }
            catch (err) {
                this.logger.logEvent({ message: 'USB Error', error: err.message });
            }
        }
    }
    getStick(onStart, onError) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.ant)
                return;
            const startupAttempt = (stick, name) => {
                return new Promise((resolve, reject) => {
                    this.logger.logEvent({ message: `${name} startup attempt` });
                    if (stick.scanConnected) {
                        onStart(this);
                        resolve(stick);
                        return;
                    }
                    if (stick.is_present()) {
                        stick.on('startup', () => {
                            if (stick.scanConnected)
                                return;
                            this.logger.logEvent({ message: `${name} startup completed` });
                            stick.scanConnected = true;
                            onStart(stick);
                            resolve(stick);
                        });
                        const devices = stick.getDevices();
                        if (devices && devices.length > 0) {
                            devices.forEach(d => {
                                d.closeFn = d.close;
                                d.close = () => { };
                            });
                        }
                        else {
                            this.logger.logEvent({ message: `${name} startup failed: no devices ` });
                            resolve(null);
                        }
                        this.getDetailedStickInfo(stick);
                        let open = false;
                        try {
                            open = stick.open();
                            if (open) {
                                this.logger.logEvent({ message: `found ${name}` });
                                const timeoutStartup = Date.now() + TIMEOUT_STARTUP;
                                const iv = setInterval(() => {
                                    if (!stick.scanConnected && Date.now() > timeoutStartup) {
                                        clearInterval(iv);
                                        this.logger.logEvent({ message: `${name} startup timeout` });
                                    }
                                    if (stick.scanConnected)
                                        clearInterval(iv);
                                }, 100);
                                return stick;
                            }
                        }
                        catch (openErr) {
                            this.logger.logEvent({ message: 'Open Error', error: openErr.message });
                        }
                        if (devices && devices.length > 0) {
                            devices.forEach(d => {
                                d.close = d.closeFn;
                            });
                        }
                        if (!open) {
                            let detachedKernelDriver = false;
                            while (devices.length) {
                                let device;
                                try {
                                    device = devices.shift();
                                    device.open();
                                    const iface = device.interfaces[0];
                                    try {
                                        if (iface.isKernelDriverActive()) {
                                            detachedKernelDriver = true;
                                            iface.detachKernelDriver();
                                        }
                                    }
                                    catch (kernelErr) {
                                        this.logger.logEvent({ message: 'Kernel Error', error: kernelErr.message });
                                    }
                                    iface.claim();
                                    break;
                                }
                                catch (deviceErr) {
                                    this.logger.logEvent({ message: 'Device Error', error: deviceErr.message });
                                    if (device) {
                                        try {
                                            device.close();
                                        }
                                        catch (_a) { }
                                    }
                                }
                            }
                        }
                    }
                    this.logger.logEvent({ message: `${name} startup failed: no stick present` });
                    resolve(null);
                });
            };
            let stick = undefined;
            stick = yield startupAttempt(new this.ant.GarminStick2(), 'GarminStick2');
            if (!stick)
                stick = yield startupAttempt(new this.ant.GarminStick3(), 'GarminStick3');
            if (!stick)
                onError('No stick found');
            else
                return stick;
        });
    }
    getFirstStick() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                if (!this.ant)
                    return reject(new Error('Ant not supported'));
                if (this.sticks && this.sticks.length > 0 && this.sticks[0].connected) {
                    this.logger.logEvent({ message: 'stick already connected' });
                    return resolve(this.sticks[0]);
                }
                try {
                    let start = Date.now();
                    let timeout = start + 5000;
                    let found = false;
                    const iv = setInterval(() => {
                        if (!found && Date.now() > timeout) {
                            clearInterval(iv);
                            reject(new Error('timeout'));
                        }
                    }, 100);
                    this.getStick((stick) => {
                        clearInterval(iv);
                        const port = this.getUSBDeviceInfo(stick.device).port;
                        if (!this.sticks.find(i => i.port === port)) {
                            this.sticks.push({ port, stick, connected: true });
                        }
                        resolve({ port, stick });
                    }, (reason) => {
                        resolve(undefined);
                    });
                }
                catch (err) {
                    this.logger.logEvent({ message: 'getFirstStick error', error: err.message, stack: err.stack });
                }
            }));
        });
    }
    closeStick(stick) {
        if (process.env.DEBUG)
            console.log('~~~Ant:closeStick');
        this.logger.logEvent({ message: 'closing stick' });
        return new Promise((resolve, reject) => {
            stick.on('shutdown', () => {
                stick.removeAllListeners('shutdown');
                const port = this.getUSBDeviceInfo(stick.device).port;
                const idx = this.sticks.findIndex(i => i.port === port);
                if (idx !== -1) {
                    this.sticks[idx].connected = false;
                }
                this.sensors.stickStarted = false;
                this.sensors.stickOpen = false;
                resolve(true);
            });
            try {
                stick.detach_all();
                setTimeout(() => {
                    try {
                        stick.close();
                    }
                    catch (err) { }
                    this.logger.logEvent({ message: 'stick closed' });
                    stick.scanConnected = false;
                }, 1000);
            }
            catch (err) {
                reject(err);
            }
        });
    }
    stopScanOnStick(stickInfo) {
        const { stick, port } = stickInfo;
        const state = this.activeScans[port];
        return this.closeStick(stick)
            .then(() => {
            state.isScanning = false;
            if (state.iv) {
                clearInterval(state.iv);
                state.iv = undefined;
            }
            return true;
        })
            .catch(err => {
            this.logger.logEvent({ message: 'error on closing stick', error: err.message, port });
            return true;
        });
    }
    scanOnStick(stickInfo, props = {}) {
        const { stick, port } = stickInfo;
        const timeout = props.timeout || DEFAULT_SCAN_TIMEOUT;
        const { onDeviceFound, onScanFinished, onUpdate, id } = props;
        this.logger.logEvent({ message: 'stick scan request', port, activeScans: this.activeScans });
        return new Promise((resolve, reject) => {
            if (!port)
                return reject(new Error('busy'));
            if (this.activeScans[port] && this.activeScans[port].isScanning)
                return reject(new Error('busy'));
            if (!this.activeScans[port]) {
                this.activeScans[port] = { isScanning: false, stick };
            }
            const state = this.activeScans[port];
            if (state.isScanning)
                return reject(new Error('busy'));
            state.isScanning = true;
            this.logger.logEvent({ message: 'start scan', port });
            state.timeout = Date.now() + timeout;
            const onNewDevice = (profile, deviceId) => {
                this.logger.logEvent({ message: 'found device', profile, id: deviceId });
                const profileInfo = this.profiles.find(i => i.name === profile);
                if (profileInfo) {
                    let device;
                    try {
                        device = new profileInfo.Adapter(deviceId, port, stick, this, props);
                        this.devices.push(device);
                    }
                    catch (err) {
                        console.log(err);
                    }
                    if (device && onDeviceFound) {
                        onDeviceFound(device, this);
                        device.setDetected(true);
                    }
                }
            };
            const onData = (profile, deviceId, data) => {
                const device = this.devices.find(d => d.getID() === deviceId);
                if (device) {
                    const isHrm = device.isHrm();
                    device.onDeviceData(data);
                    if (device.isHrm() && !isHrm && onDeviceFound) {
                        onDeviceFound(device, this);
                    }
                    if (onUpdate)
                        onUpdate(device);
                }
            };
            const hrm = new AntProfile('Heartrate Monitor', this.ant.HeartRateScanner, stick, 'hbData', onNewDevice, onData);
            const fe = new AntProfile('Smart Trainer', this.ant.FitnessEquipmentScanner, stick, 'fitnessData', onNewDevice, onData);
            const power = new AntProfile('Power Meter', this.ant.BicyclePowerScanner, stick, 'powerData', onNewDevice, onData);
            try {
                hrm.getScanner().scan();
                hrm.getScanner().on('attached', () => {
                    power.getScanner().scan();
                    fe.getScanner().scan();
                });
            }
            catch (err) {
                this.logger.logEvent({ message: 'scan error', error: err.message });
            }
            state.iv = setInterval(() => {
                if (Date.now() > timeout) {
                    this.logger.logEvent({ message: 'scan timeout', port });
                    this.stopScanOnStick(stickInfo).then(() => {
                        if (onScanFinished)
                            onScanFinished(id);
                        resolve(true);
                    });
                }
            }, timeout);
        });
    }
    scan(props) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: 'scan request', props });
            this.logStickInfo();
            try {
                const stick = yield this.getFirstStick();
                if (!stick) {
                    this.logger.logEvent({ message: 'no stick found' });
                    return;
                }
                this.scanOnStick(stick, props);
            }
            catch (err) {
                this.logger.logEvent({ message: 'scan request error', error: err.message });
            }
        });
    }
    stopScan() {
        return __awaiter(this, void 0, void 0, function* () {
            const activePorts = Object.keys(this.activeScans);
            for (let i = 0; i < activePorts.length; i++) {
                const port = activePorts[i];
                const scanState = this.activeScans[port];
                if (scanState.isScanning) {
                    yield this.stopScanOnStick({ port, stick: scanState.stick });
                }
            }
            this.logger.logEvent({ message: 'scan stopped' });
            return true;
        });
    }
    attachSensors(d, SensorClass, message) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                if (d === undefined) {
                    resolve(false);
                    return;
                }
                const devices = Array.isArray(d) ? d : [d];
                if (devices.length === 0) {
                    return resolve(false);
                }
                if (!this.sensors.stick) {
                    const stick = this.findStickByPort(devices[0].getPort());
                    let opened = false;
                    if (!stick.inUse) {
                        try {
                            stick.open();
                            opened = true;
                        }
                        catch (err) {
                            console.log(err);
                        }
                        if (!opened)
                            return false;
                    }
                    else {
                        opened = true;
                    }
                    this.sensors.stick = stick;
                    this.sensors.stickOpen = opened;
                }
                if (this.sensors.stickOpen) {
                    if (!this.sensors.pending)
                        this.sensors.pending = [];
                    devices.forEach(device => {
                        const sensor = new SensorClass(this.sensors.stick);
                        device.setSensor(sensor);
                        sensor.on(message, (data) => { device.onDeviceData(data); });
                        sensor.on('eventData', (data) => { device.onDeviceEvent(data); });
                        sensor.once('attached', () => { device.onAttached(); });
                        this.sensors.pending.push({ device, sensor, message });
                    });
                }
                const attachFromPending = () => {
                    if (!this.sensors.attached)
                        this.sensors.attached = [];
                    const channelsUsed = this.sensors.attached.length;
                    this.sensors.pending.forEach((i, idx) => {
                        const channel = channelsUsed + idx;
                        const { sensor } = i;
                        i.device.setChannel(channel);
                        if (process.env.DEBUG)
                            console.log('~~~~Ant: attach', channel, i.device.getID());
                        sensor.attach(channel, i.device.getID());
                        this.sensors.attached.push(i);
                    });
                    this.sensors.pending = [];
                    resolve(true);
                };
                if (this.sensors.stickStarted) {
                    attachFromPending();
                }
                else {
                    this.sensors.stick.once('startup', () => {
                        this.sensors.stickStarted = true;
                        setTimeout(attachFromPending, 1000);
                    });
                }
            });
        });
    }
    detachSensor(adapter) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            const idx = (this.sensors && this.sensors.attached) ?
                this.sensors.attached.findIndex(i => (i.device.getID() === adapter.getID() && i.device.getName() === adapter.getName())) : -1;
            if (idx === -1)
                return resolve(true);
            this.sensors.attached.splice(idx, 1);
            if (this.sensors.attached.length > 0)
                return resolve(true);
            const stick = this.sensors.stick;
            if (stick === undefined)
                return resolve(false);
            try {
                yield this.closeStick(stick);
                resolve(true);
            }
            catch (err) {
                reject(err);
            }
        }));
    }
    closeSensor(device) {
        return __awaiter(this, void 0, void 0, function* () {
            const stick = this.findStickByPort(device.getPort());
            if (stick.inUse) {
                try {
                    stick.close();
                }
                catch (err) {
                    console.log(err);
                }
            }
        });
    }
}
exports.AntProtocol = AntProtocol;
let _scanner = undefined;
function AntScanner(antClass) {
    const scanner = _scanner || new AntProtocol(antClass);
    return scanner;
}
exports.AntScanner = AntScanner;
