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
const utils_1 = require("../utils");
const events_1 = __importDefault(require("events"));
const DEFAULT_RCV_TIMEOUT = 1500;
const DEFAULT_OPEN_TIMEOUT = 3000;
const DEBUG_LOGGER = {
    log: (e, ...args) => console.log(e, ...args),
    logEvent: (event) => console.log(JSON.stringify(event))
};
var SerialCommsState;
(function (SerialCommsState) {
    SerialCommsState[SerialCommsState["Idle"] = 0] = "Idle";
    SerialCommsState[SerialCommsState["Connecting"] = 1] = "Connecting";
    SerialCommsState[SerialCommsState["Connected"] = 2] = "Connected";
    SerialCommsState[SerialCommsState["Disconnecting"] = 3] = "Disconnecting";
    SerialCommsState[SerialCommsState["Disconnected"] = 4] = "Disconnected";
    SerialCommsState[SerialCommsState["Error"] = 5] = "Error";
})(SerialCommsState = exports.SerialCommsState || (exports.SerialCommsState = {}));
var SendState;
(function (SendState) {
    SendState[SendState["Idle"] = 0] = "Idle";
    SendState[SendState["Sending"] = 1] = "Sending";
    SendState[SendState["Receiving"] = 2] = "Receiving";
})(SendState = exports.SendState || (exports.SendState = {}));
const CRLF = '\r\n';
class KettlerSerialComms extends events_1.default {
    constructor(opts) {
        super();
        this.stateIn = (allowedStates) => {
            return allowedStates.indexOf(this.state) >= 0;
        };
        this.logger = process.env.DEBUG ? DEBUG_LOGGER : (opts.logger || new gd_eventlog_1.EventLogger(opts.protocol.getName()));
        this.port = opts.port || process.env.COM_PORT;
        this.sp = undefined;
        this.queue = new utils_1.Queue();
        this.state = SerialCommsState.Idle;
        this.sendState = SendState.Idle;
        this.settings = opts.settings || {};
        this.currentCmd = undefined;
        this.currentTimeout = undefined;
        this.protocol = opts.protocol;
    }
    getPort() {
        return this.port;
    }
    setPort(port) {
        this.port = port;
    }
    getLogger() {
        return this.logger;
    }
    isConnected() {
        return this.state === SerialCommsState.Connected;
    }
    _setState(state) {
        this.state = state;
    }
    _setSendState(state) {
        this.sendState = state;
    }
    _setCurrentCmd(cmd) {
        this.currentCmd = cmd;
    }
    stopCurrentTimeoutCheck() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = undefined;
        }
    }
    onPortOpen() {
        this.logger.logEvent({ message: 'port opened', port: this.getPort() });
        this.state = SerialCommsState.Connected;
        this.sendState = SendState.Idle;
        this.stopCurrentTimeoutCheck();
        this.startWorker();
        this.emit('opened');
    }
    onPortClose() {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: 'port closed', port: this.getPort() });
            this.stopWorker();
            if (this.sendState === SendState.Sending) {
            }
            this.state = SerialCommsState.Disconnected;
            this.sendState = SendState.Idle;
            this.stopCurrentTimeoutCheck();
            this.queue.clear();
            this.emit('closed');
            this.sp.removeAllListeners();
            this.sp = undefined;
        });
    }
    onPortError(err) {
        let ignore = false;
        if (this.stateIn([SerialCommsState.Connected, SerialCommsState.Disconnected]))
            ignore = true;
        if (this.state === SerialCommsState.Disconnecting && (err.message === 'Port is not open' || err.message === 'Writing to COM port (GetOverlappedResult): Operation aborted'))
            ignore = true;
        if (this.state === SerialCommsState.Connecting && (err.message === 'Port is already open' || err.message === 'Port is opening'))
            ignore = true;
        if (!ignore) {
            this.logger.logEvent({ message: "port error:", port: this.getPort(), error: err.message, stack: err.stack, state: this.state });
            this.emit('error', err);
            this.stopCurrentTimeoutCheck();
            if (this.state === SerialCommsState.Connecting || this.state === SerialCommsState.Disconnecting) {
                this.state = SerialCommsState.Error;
                this.sp.removeAllListeners();
                this.sp = undefined;
            }
        }
    }
    open() {
        this.logger.logEvent({ message: "open()", port: this.getPort() });
        if (this.stateIn([SerialCommsState.Connected, SerialCommsState.Connecting, SerialCommsState.Disconnecting])) {
            return;
        }
        try {
            const SerialPort = this.protocol.getSerialPort();
            if (this.sp === undefined) {
                this.sp = new SerialPort(this.getPort(), this.settings);
                this.sp.on('open', () => { this.onPortOpen(); });
                this.sp.on('close', () => { this.onPortClose(); });
                this.sp.on('error', (error) => { this.onPortError(error); });
            }
            this.state = SerialCommsState.Connecting;
            const parser = this.sp.pipe(new SerialPort.parsers.Readline({ delimiter: CRLF }));
            parser.on('data', (data) => { this.onData(data); });
            this.sp.open();
            const timeout = this.settings.openTimeout || DEFAULT_OPEN_TIMEOUT;
            this.currentTimeout = setTimeout(() => {
                this.logger.logEvent({ message: "open() timeout", port: this.getPort() });
                this.onPortError(new Error("open() timeout"));
            }, timeout);
        }
        catch (err) {
            this.logger.logEvent({ message: "error", fn: 'open()', error: err.message });
            this.state = SerialCommsState.Disconnected;
        }
    }
    close() {
        this.logger.logEvent({ message: 'close()', port: this.getPort() });
        if (this.stateIn([SerialCommsState.Idle, SerialCommsState.Disconnected, SerialCommsState.Disconnecting])) {
            return;
        }
        this.state = SerialCommsState.Disconnecting;
        this.sp.close();
    }
    startWorker() {
        this.worker = setInterval(() => {
            this.sendNextCommand();
        }, 50);
    }
    stopWorker() {
        if (this.worker) {
            clearInterval(this.worker);
            this.worker = undefined;
        }
    }
    clearTimeout() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = undefined;
        }
    }
    onData(data) {
        this.clearTimeout();
        this.logger.logEvent({ message: "sendCommand:receiving:", data: data });
        this.sendState = SendState.Idle;
        if (typeof data === 'string') {
            if (this.currentCmd.onResponse)
                this.currentCmd.onResponse(data);
        }
        else {
            if (this.currentCmd.onResponse)
                this.currentCmd.onResponse(data);
        }
        this.currentCmd = undefined;
    }
    write(cmd) {
        this.sendState = SendState.Sending;
        const { logStr, message, timeout = (this.settings.timeout || DEFAULT_RCV_TIMEOUT) } = cmd;
        const msg = typeof message === 'string' ? message : utils_1.hexstr(message);
        const onError = (err) => {
            this.logger.logEvent({ message: "sendCommand:error:", cmd: logStr, error: err.message, port: this.getPort() });
            if (cmd.onError)
                cmd.onError(err);
            this.sendState = SendState.Idle;
            this.currentCmd = undefined;
            this.stopCurrentTimeoutCheck();
        };
        try {
            this.logger.logEvent({ message: "sendCommand:sending:", cmd: logStr, msg, port: this.getPort() });
            if (typeof (message) !== 'string')
                throw new Error('message must be a string');
            this.sp.write(msg + CRLF, (err) => {
                this.sendState = SendState.Receiving;
                this.currentCmd = cmd;
                if (err)
                    onError(err);
            });
            this.currentTimeout = setTimeout(() => {
                if (this.sendState === SendState.Sending) {
                    onError(new Error("send timeout"));
                }
                if (this.sendState === SendState.Receiving) {
                    onError(new Error("response timeout"));
                }
            }, timeout);
        }
        catch (err) {
            onError(err);
        }
    }
    sendNextCommand() {
        if (this.sendState !== SendState.Idle) {
            return;
        }
        const cmd = this.queue.dequeue();
        if (cmd)
            this.write(cmd);
    }
    send(cmd) {
        this.logger.logEvent({ message: 'add command to queue', cmd: cmd.logStr, msg: cmd.message, port: this.getPort(), queueSize: this.queue.size() });
        this.queue.enqueue(cmd);
    }
}
exports.default = KettlerSerialComms;
