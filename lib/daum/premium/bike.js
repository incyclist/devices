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
exports.Daum8iSerial = exports.Daum8iTcp = void 0;
const constants_1 = require("../constants");
const tcpserial_1 = __importDefault(require("./tcpserial"));
const utils_1 = require("./utils");
const gd_eventlog_1 = require("gd-eventlog");
const nop = () => { };
const MAX_RETRIES = 5;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_SEND_DELAY = 1000;
const TIMEOUT_START = 15000;
const OPEN_TIMEOUT = 1000;
const DAUM_PREMIUM_DEFAULT_PORT = 51955;
const DAUM_PREMIUM_DEFAULT_HOST = '127.0.0.1';
var __SerialPort = undefined;
var net = undefined;
const DEBUG_LOGGER = {
    log: (e, ...args) => console.log(e, ...args),
    logEvent: (event) => console.log(JSON.stringify(event))
};
class Daum8i {
    constructor(props) {
        this.props = props || {};
        this.logger = process.env.DEBUG ? DEBUG_LOGGER : new gd_eventlog_1.EventLogger('DaumPremium');
        this.logger.logEvent({ message: 'new DaumPremium object', props: this.props });
        if (this.props.interface === 'tcpip') {
            const port = this.props.port || DAUM_PREMIUM_DEFAULT_PORT;
            const host = this.props.host || DAUM_PREMIUM_DEFAULT_HOST;
            this.portName = `${host}:51955`;
            this.tcpip = true;
            this.serial = false;
            this.tcpipConnection = { host, port };
        }
        else {
            this.portName = this.props.port || process.env.COM_PORT;
            this.tcpip = false;
            this.serial = true;
            this.port = this.portName;
        }
        this.settings = this.props.settings || {};
        this.settings.logger = this.logger;
        this.sendRetryDelay = DEFAULT_SEND_DELAY;
        this.sp = undefined;
        this.connected = false;
        this.blocked = false;
        this.state = {
            ack: { wait: false, startWait: undefined },
            commandsInQueue: {},
        };
        this.bikeData = {
            userWeight: 75,
            bikeWeight: 10,
            maxPower: 800
        };
    }
    static getClassName() {
        return "Daum8i";
    }
    getType() {
        return "Daum8i";
    }
    static setSerialPort(spClass) {
        __SerialPort = spClass;
    }
    static setNetImpl(netClass) {
        net = netClass;
    }
    static getSupportedInterfaces() {
        return [constants_1.BIKE_INTERFACE.SERIAL, constants_1.BIKE_INTERFACE.TCPIP];
    }
    getPort() {
        return this.portName;
    }
    isConnected() {
        return this.connected;
    }
    setUser(user, callback) {
        this.logger.logEvent({ message: "setUser()", user, port: this.portName });
        this.settings.user = user || {};
        var cb = callback || nop;
        cb(200, user);
    }
    getUserWeight() {
        if (!this.settings || !this.settings.user || !this.settings.user.weight)
            return 75;
        return this.settings.user.weight;
    }
    getBikeWeight() {
        return 10;
    }
    unblock() {
        this.blocked = false;
    }
    connect() {
        this.logger.logEvent({ message: "connect()", sp: (this.sp !== undefined), connected: this.connected, blocked: this.blocked, port: this.portName, settings: this.settings });
        if (this.connected || this.blocked) {
            return;
        }
        this.state.busy = true;
        this.state.commandsInQueue = {};
        try {
            if (this.sp !== undefined) {
                try {
                    this.sp.removeAllListeners();
                    this.sp.close();
                }
                catch (err) {
                }
                this.sp = undefined;
            }
            if (this.sp === undefined) {
                if (this.tcpip) {
                    const { host, port } = this.tcpipConnection;
                    const { logger } = this.props;
                    this.logger.logEvent({ message: "creating TCPSocketPort", host, port });
                    this.sp = new tcpserial_1.default({ host, port, net, timeout: OPEN_TIMEOUT, logger });
                }
                else {
                    const settings = this.settings.port || {};
                    settings.autoOpen = false;
                    this.logger.logEvent({ message: "creating SerialPort", port: this.port, settings });
                    this.sp = new __SerialPort(this.port, settings);
                }
                this.sp.on('open', this.onPortOpen.bind(this));
                this.sp.on('close', this.onPortClose.bind(this));
                this.sp.on('error', (error) => { this.onPortError(error); });
                this.sp.on('data', (data) => { this.onData(data); });
            }
            const start = Date.now();
            this.state.connecting = true;
            this.state.opening = { start, timeout: start + this.getTimeoutValue() };
            this.logger.logEvent({ message: "opening port ..." });
            this.sp.open();
        }
        catch (err) {
            this.logger.logEvent({ message: "scan:error:", error: err.message, stack: err.stack });
            this.state.busy = false;
        }
    }
    reconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveClose();
            yield this.saveConnect();
        });
    }
    saveConnect() {
        return new Promise((resolve, reject) => {
            if (this.isConnected()) {
                this.state.connecting = false;
                return resolve(true);
            }
            this.connect();
            const tTimeout = Date.now() + TIMEOUT_START;
            const iv = setInterval(() => {
                if (this.state.error !== undefined) {
                    console.log('~~ -> error');
                    clearInterval(iv);
                    this.forceClose();
                    reject(this.state.error);
                    this.state = { opened: false, closed: true, busy: false };
                }
                else if (this.isConnected()) {
                    console.log('~~ -> connected');
                    this.state.connecting = false;
                    resolve(true);
                    clearInterval(iv);
                }
                else {
                    if (Date.now() > tTimeout) {
                        console.log('~~ -> timeout');
                        this.state.connecting = false;
                        this.forceClose();
                        clearInterval(iv);
                        reject(new Error('timeout'));
                    }
                }
            }, 100);
        });
    }
    onPortOpen() {
        this.error = undefined;
        this.connected = true;
        this.state.opening = undefined;
        this.state.opened = true;
        this.state.busy = false;
        this.logger.logEvent({ message: "port opened", port: this.portName });
    }
    onPortClose() {
        this.logger.logEvent({ message: "port closed", port: this.portName });
        this.error = undefined;
        this.connected = false;
        if (this.state.opening) {
            this.state.opened = false;
            this.state.closed = true;
        }
        else {
            this.state = { opened: false, closed: true, busy: false };
        }
        this.sp.removeAllListeners();
        this.sp = undefined;
        if (this.queue !== undefined)
            this.queue.clear();
    }
    getLogState() {
        let s = undefined;
        const { sending, busy, opening, connecting, writeBusy, waitingForStart, waitingForAck, waitingForEnd, retry } = this.state;
        if (sending) {
            s = {};
            s.command = sending.command;
            s.payload = sending.payload;
        }
        return { sending: s, busy, writeBusy, opening, connecting, waitingForStart, waitingForEnd, waitingForAck, retry };
    }
    onPortError(error) {
        this.logger.logEvent({ message: "port error:", port: this.portName, error: error.message, connected: this.connected, state: this.getLogState() });
        this.error = error;
        if (this.blocked) {
            if (!this.state.closed) {
                if (this.sp) {
                    this.sp.removeAllListeners();
                    this.sp.close();
                    this.sp = undefined;
                }
                this.state = { opened: false, closed: true, busy: false };
            }
            return;
        }
        if (this.state.closing) {
            if (error.message === 'Port is not open') {
                this.state = { opened: false, closed: true, busy: false };
                return;
            }
            else {
                this.forceClose();
            }
        }
        else if (this.state.opening) {
            if (this.state.connecting) {
                this.state.error = error;
            }
            else {
                this.onPortOpen();
            }
        }
        else if (this.state.sending) {
            this.state.error = error;
            this.forceClose(false);
            return;
        }
        this.state.busy = false;
    }
    errorHandler() {
        throw new Error("Error");
    }
    saveClose(force) {
        return new Promise((resolve, reject) => {
            if (force)
                this.blocked = true;
            this.close();
            const start = Date.now();
            const iv = setInterval(() => {
                if (this.state.closed || (Date.now() - start > DEFAULT_TIMEOUT)) {
                    clearInterval(iv);
                    resolve(true);
                    return;
                }
            }, 50);
        });
    }
    forceClose(updateState = false) {
        console.log('~~~ forceClose', updateState);
        const sp = this.sp;
        if (!this.sp)
            return;
        this.sp.removeAllListeners();
        try {
            sp.unpipe();
            sp.flush();
        }
        catch (_a) { }
        sp.close();
        this.connected = false;
        if (updateState)
            this.state = { opened: false, closed: true, busy: false };
    }
    close() {
        this.logger.logEvent({ message: 'close request', port: this.portName });
        var sp = this.sp;
        let connected = this.connected;
        try {
            if (connected) {
                if (sp) {
                    sp.unpipe();
                    sp.flush();
                    sp.close();
                }
                if (this.queue !== undefined) {
                    this.queue.clear();
                    this.queue = undefined;
                }
            }
            else {
                if (sp)
                    sp.close();
            }
        }
        catch (err) {
            this.logger.logEvent({ message: 'close: Exception', port: this.portName, error: err.message });
        }
        this.connected = false;
        const start = Date.now();
        if (this.state.closing === undefined)
            this.state.closing = { start, timeout: start + this.getTimeoutValue(), retry: 0, maxRetries: MAX_RETRIES };
        else {
            this.state.closing.start = start;
            this.state.closing.timeout = start + this.getTimeoutValue();
            this.state.retry = this.state.retry + 1;
        }
        this.state.busy = false;
    }
    sendTimeout(message) {
        this.logger.logEvent({ message: `sendCommand:${message || 'timeout'}`, port: this.portName, cmd: this.cmdCurrent });
        delete this.state.commandsInQueue[this.cmdCurrent.command];
        if (this.cmdCurrent.callbackErr !== undefined) {
            let cb = this.cmdCurrent.callbackErr;
            this.state.busy = false;
            this.cmdCurrent = undefined;
            this.cmdStart = undefined;
            cb(408, { message: message || "timeout" });
        }
    }
    checkForResponse() {
        const d = Date.now();
        const s = this.state.sending;
        if (s === undefined)
            return false;
        const rejectFn = s.reject;
        const reject = (err) => {
            if (rejectFn && typeof rejectFn === 'function') {
                rejectFn(err);
            }
        };
        const error = this.state.error;
        if (error !== undefined) {
            reject(error);
            return false;
        }
        try {
            if (this.state.waitingForACK) {
                const timeoutACK = this.state.ack ? this.state.ack.timeout : this.state.sending.timeout;
                if (d < timeoutACK)
                    return true;
                reject(new Error('ACK timeout'));
                return false;
            }
            if (d < this.state.sending.timeout)
                return true;
            reject(new Error('RESP timeout'));
            return false;
        }
        catch (err) {
            this.logger.logEvent({ message: 'checkForResponse: Exception', port: this.portName, error: err.message, stack: err.stack });
        }
        return true;
    }
    getTimeoutValue(cmd) {
        let timeout = DEFAULT_TIMEOUT;
        if (this.settings && this.settings.tcpip && this.settings.tcpip.timeout)
            timeout = this.settings.tcpip.timeout;
        if (this.settings && this.settings.serial && this.settings.serial.timeout)
            timeout = this.settings.serial.timeout;
        if (cmd !== undefined && cmd.options !== undefined && cmd.options.timeout !== undefined) {
            timeout = cmd.options.timeout;
        }
        return timeout;
    }
    onData(data) {
        let cmd = '';
        if (this.state.waitingForEnd) {
            cmd = this.state.partialCmd;
        }
        const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
        const s = this.state.sending;
        if (s === undefined) {
            if (this.state.input === undefined)
                this.state.input = bufferData;
            return;
        }
        const { portName, resolve } = this.state.sending;
        let incoming;
        if (this.state.input !== undefined) {
            const arr = [this.state.input, bufferData];
            incoming = Buffer.concat(arr);
        }
        else {
            incoming = bufferData;
        }
        const response = [...incoming];
        this.logger.logEvent({ message: 'sendCommand:RECV', data: (0, utils_1.hexstr)(response) });
        for (let i = 0; i < incoming.length; i++) {
            const getRemaining = () => {
                let remaining = '';
                const done = i === (incoming.length - 1);
                if (!done) {
                    for (let j = i + 1; j < incoming.length; j++)
                        remaining += String.fromCharCode(incoming.readUInt8(j));
                }
                return remaining;
            };
            const c = incoming.readUInt8(i);
            if (c === 0x06) {
                this.logger.logEvent({ message: "sendCommand:ACK received:", port: portName });
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                const remaining = getRemaining();
                if (remaining && remaining !== '')
                    return this.onData(remaining);
            }
            else if (c === 0x15) {
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                this.logger.logEvent({ message: "sendCommand:NAK received:", port: portName });
                const remaining = getRemaining();
                if (remaining && remaining !== '')
                    return this.onData(remaining);
            }
            else if (c === 0x01) {
                this.state.waitingForEnd = true;
            }
            else if (c === 0x17) {
                const remaining = getRemaining();
                this.logger.logEvent({ message: "sendCommand:received:", duration: Date.now() - this.state.sending.tsRequest, port: portName, cmd: `${cmd} [${(0, utils_1.hexstr)(cmd)}]`, remaining: (0, utils_1.hexstr)(remaining) });
                this.state.waitingForEnd = false;
                const cmdStr = cmd.substring(0, cmd.length - 2);
                const checksumExtracted = cmd.slice(-2);
                const checksumCalculated = (0, utils_1.checkSum)((0, utils_1.getAsciiArrayFromStr)(cmdStr), []);
                if (checksumExtracted === checksumCalculated) {
                    this.sendACK();
                    if (this.state.sending && this.state.sending.responseCheckIv) {
                        clearInterval(this.state.sending.responseCheckIv);
                    }
                    this.state = {
                        sending: undefined,
                        busy: false,
                        writeBusy: false,
                        waitingForStart: false,
                        waitingForEnd: false,
                        waitingForACK: false,
                    };
                    const payload = cmd.substring(3, cmd.length - 2);
                    resolve(payload);
                }
                else {
                    this.sendNAK();
                }
                cmd = '';
                if (remaining)
                    return this.onData(remaining);
            }
            else {
                if (this.state.waitingForEnd)
                    cmd += String.fromCharCode(c);
            }
        }
        if (this.state.waitingForEnd) {
            this.state.partialCmd = cmd;
        }
    }
    sendDaum8iCommand(command, queryType, payload) {
        const tsRequest = Date.now();
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (this.blocked)
                return reject(new Error('blocked'));
            if (!this.state.busy) {
                this.state.busy = true;
            }
            else {
                const message = (0, utils_1.buildMessage)(command, payload);
                this.logger.logEvent({ message: 'sendCommand:waiting', port: this.portName, cmd: command, hex: (0, utils_1.hexstr)(message) });
                const busyWait = () => {
                    return new Promise((done) => {
                        let start = Date.now();
                        let timeout = start + 5000;
                        const iv = setInterval(() => {
                            if (this.state.busy) {
                                if (Date.now() > timeout) {
                                    clearInterval(iv);
                                    done(false);
                                }
                            }
                            else {
                                clearInterval(iv);
                                done(true);
                            }
                        }, 10);
                    });
                };
                const res = yield busyWait();
                if (!res) {
                    this.logger.logEvent({ message: 'sendCommand:busy timeout', port: this.portName, cmd: command, hex: (0, utils_1.hexstr)(message), duration: Date.now() - tsRequest });
                    return reject(new Error('BUSY timeout'));
                }
                this.state.busy = true;
            }
            const writeDone = () => {
                this.state.sending = undefined;
                this.state.writeBusy = false;
                this.state.busy = false;
                this.state.sending = undefined;
                this.state.waitingForStart = false;
                this.state.waitingForEnd = false;
                this.state.waitingForACK = false;
            };
            const port = this.sp;
            const portName = this.portName;
            this.state.received = [];
            try {
                const message = (0, utils_1.buildMessage)(command, payload);
                const start = Date.now();
                const timeout = start + this.getTimeoutValue();
                this.logger.logEvent({ message: "sendCommand:sending:", port: this.portName, cmd: command, hex: (0, utils_1.hexstr)(message) });
                this.state.writeBusy = true;
                if (!this.connected || port === undefined) {
                    this.logger.logEvent({ message: "sendCommand:error: not connected", port: this.portName });
                    writeDone();
                    return reject(new Error('not connected'));
                }
                port.write(message);
                this.state.waitingForACK = true;
                this.state.writeBusy = false;
                this.state.retry = 0;
                this.state.ack = { start, timeout };
                this.state.sending = { command, payload, start, timeout, port, portName, tsRequest, resolve, reject };
                const iv = this.state.sending.responseCheckIv = setInterval(() => {
                    const stillWaiting = this.checkForResponse();
                    if (!stillWaiting) {
                        clearInterval(iv);
                        writeDone();
                    }
                }, 10);
            }
            catch (err) {
                this.logger.logEvent({ message: "sendCommand:error:", port: portName, error: err.message, stack: err.stack });
                writeDone();
                reject(err);
            }
        }));
    }
    sendACK() {
        const port = this.portName;
        this.state.writeBusy = true;
        try {
            this.sp.write([0x06]);
        }
        catch (err) { }
        this.state.writeBusy = false;
        this.logger.logEvent({ message: "sendCommand:sending ACK", port, queue: this.state.commandsInQueue });
    }
    sendNAK() {
        const port = this.portName;
        try {
            this.sp.write([0x15]);
        }
        catch (err) { }
        this.logger.logEvent({ message: "sendCommand:sending NAK", port });
    }
    sendReservedDaum8iCommand(command, cmdType, data) {
        let cmdData = [];
        const key = (0, utils_1.getReservedCommandKey)(command);
        (0, utils_1.append)(cmdData, (0, utils_1.Int16ToIntArray)(key));
        if (data !== undefined && data.length > 0) {
            (0, utils_1.append)(cmdData, (0, utils_1.Int16ToIntArray)(data.length));
            (0, utils_1.append)(cmdData, data);
        }
        else {
            (0, utils_1.append)(cmdData, (0, utils_1.Int16ToIntArray)(0));
        }
        return this.sendDaum8iCommand('M70', cmdType, (0, utils_1.bin2esc)(cmdData))
            .then((resData) => {
            const cmd = (0, utils_1.esc2bin)(resData);
            cmd.splice(0, 4);
            return cmd;
        });
    }
    getProtocolVersion() {
        return this.sendDaum8iCommand('V00', 'AF', [])
            .then((data) => {
            const version = data.substring(0, 1) + '.' + data.substring(1);
            return (version);
        });
    }
    getDashboardVersion() {
        return this.sendDaum8iCommand('V70', 'AF', []);
    }
    getDeviceType() {
        return this.sendDaum8iCommand('Y00', 'AF', [])
            .then((str) => {
            let deviceType;
            if (str === '0')
                deviceType = 'run';
            else if (str === '2')
                deviceType = 'bike';
            else if (str === '7')
                deviceType = 'lyps';
            else
                throw (new Error(`unknown device type ${typeof str === 'string' ? (0, utils_1.ascii)(str.charAt(0)) : str}`));
            return deviceType;
        });
    }
    getActualBikeType() {
        return this.sendDaum8iCommand('M72', 'AF', [])
            .then((str) => {
            let deviceType;
            if (str === '0')
                deviceType = constants_1.ACTUAL_BIKE_TYPE.ALLROUND;
            else if (str === '1')
                deviceType = constants_1.ACTUAL_BIKE_TYPE.RACE;
            else if (str === '2')
                deviceType = constants_1.ACTUAL_BIKE_TYPE.MOUNTAIN;
            else {
                throw (new Error(`unknown actual device type ${typeof str === 'string' ? (0, utils_1.ascii)(str.charAt(0)) : str}`));
            }
            this.state.actualBikeType = deviceType;
            return deviceType;
        });
    }
    setActualBikeType(actualBikeType) {
        let bikeType;
        switch (actualBikeType) {
            case constants_1.ACTUAL_BIKE_TYPE.ALLROUND:
                bikeType = '0';
                break;
            case constants_1.ACTUAL_BIKE_TYPE.RACE:
                bikeType = '1';
                break;
            case constants_1.ACTUAL_BIKE_TYPE.TRIATHLON:
                bikeType = '1';
                break;
            case constants_1.ACTUAL_BIKE_TYPE.MOUNTAIN:
                bikeType = '2';
                break;
            default:
                bikeType = undefined;
        }
        return this.sendDaum8iCommand(`M72${bikeType}`, 'BF', [])
            .then((str) => {
            let deviceType;
            if (str === '0')
                deviceType = constants_1.ACTUAL_BIKE_TYPE.ALLROUND;
            else if (str === '1')
                deviceType = constants_1.ACTUAL_BIKE_TYPE.RACE;
            else if (str === '2')
                deviceType = constants_1.ACTUAL_BIKE_TYPE.MOUNTAIN;
            else
                throw (new Error('unknown actual device type'));
            this.state.actualBikeType = deviceType;
            return deviceType;
        });
    }
    getTrainingData() {
        return this.sendDaum8iCommand('X70', 'AF', [])
            .then((data) => {
            const td = (0, utils_1.parseTrainingData)(data);
            return td;
        });
    }
    setLoadControl(enabled) {
        const val = enabled ? (0, utils_1.ascii)('1') : (0, utils_1.ascii)('0');
        return this.sendDaum8iCommand('S20', 'BF', [val])
            .then((data) => {
            const res = data === '1';
            return res;
        });
    }
    getLoadControl() {
        return this.sendDaum8iCommand('S20', 'AF', [])
            .then((data) => {
            const res = data === '1';
            return res;
        });
    }
    setSlope(slope) {
        this.logger.logEvent({ message: 'setSlope not implemted' });
        return;
    }
    setPower(power) {
        const powerStr = Number.parseFloat(power).toFixed(2);
        return this.sendDaum8iCommand(`S23${powerStr}`, 'BF', [])
            .then((str) => {
            return parseInt(str);
        });
    }
    getPower(power) {
        return this.sendDaum8iCommand('S23', 'AF', [])
            .then((str) => {
            return parseInt(str);
        });
    }
    setPerson(person) {
        return this.sendReservedDaum8iCommand('PERSON_SET', 'BF', person.getData());
    }
    setGear(gear) {
        return this.sendDaum8iCommand('M71', 'BF', `${gear}`)
            .then((str) => {
            const gearVal = parseInt(str);
            return gearVal > 0 ? gearVal - 1 : undefined;
        });
    }
    getGear() {
        return this.sendDaum8iCommand('M71', 'AF', '')
            .then((str) => {
            return parseInt(str);
        });
    }
}
class Daum8iTcp extends Daum8i {
    static getClassName() { return "Daum8i"; }
    getType() { return "Daum8iTcp"; }
    static setSerialPort(spClass) { }
    getInterface() { return constants_1.BIKE_INTERFACE.TCPIP; }
    static setNetImpl(netClass) {
        net = netClass;
    }
    static getSupportedInterfaces() {
        return [constants_1.BIKE_INTERFACE.TCPIP];
    }
}
exports.Daum8iTcp = Daum8iTcp;
class Daum8iSerial extends Daum8i {
    static getClassName() { return "Daum8i"; }
    getType() { return "Daum8iSerial"; }
    getInterface() { return constants_1.BIKE_INTERFACE.SERIAL; }
    static setSerialPort(spClass) {
        __SerialPort = spClass;
    }
    static setNetImpl(netClass) { }
    static getSupportedInterfaces() {
        return [constants_1.BIKE_INTERFACE.SERIAL];
    }
}
exports.Daum8iSerial = Daum8iSerial;
