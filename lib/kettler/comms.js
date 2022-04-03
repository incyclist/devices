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
const DEFAULT_RCV_TIMEOUT = 500;
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
})(SerialCommsState || (SerialCommsState = {}));
var SendState;
(function (SendState) {
    SendState[SendState["Idle"] = 0] = "Idle";
    SendState[SendState["Sending"] = 1] = "Sending";
    SendState[SendState["Receiving"] = 2] = "Receiving";
})(SendState || (SendState = {}));
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
        this.protocol = opts.protocol;
    }
    getPort() {
        return this.port;
    }
    setPort(port) {
        this.port = port;
    }
    isConnected() {
        return this.state === SerialCommsState.Connected;
    }
    onPortOpen() {
        this.logger.logEvent({ message: 'port opened', port: this.getPort() });
        this.state = SerialCommsState.Connected;
        this.sendState = SendState.Idle;
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
            this.queue.clear();
            this.emit('closed');
            this.sp.removeAllListeners();
            this.sp = undefined;
        });
    }
    onPortError(err) {
        if (this.stateIn([SerialCommsState.Connected, SerialCommsState.Disconnected]))
            return;
        if (this.state === SerialCommsState.Disconnecting && (err.message === 'Port is not open' || err.message === 'Writing to COM port (GetOverlappedResult): Operation aborted'))
            return;
        if (this.state === SerialCommsState.Connecting && (err.message === 'Port is already open' || err.message === 'Port is opening'))
            return;
        this.logger.logEvent({ message: "port error:", port: this.getPort(), error: err.message, stack: err.stack, state: this.state });
        this.emit('error', err);
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
    onData(data) {
        this.sendState = SendState.Idle;
        this.currentCmd = undefined;
        this.logger.logEvent({ message: "sendCommand:receiving:", data: data });
        if (typeof data === 'string') {
            if (data.length > 2)
                data = data.trim();
            this.currentCmd.onResponse(data);
        }
        else {
            this.currentCmd.onResponse(data);
        }
    }
    write(cmd) {
        this.sendState = SendState.Sending;
        const { logStr, message, timeout = (this.settings.timeout || DEFAULT_RCV_TIMEOUT) } = cmd;
        const msg = typeof message === 'string' ? message : utils_1.hexstr(message);
        const onError = (err) => {
            this.logger.logEvent({ message: "sendCommand:error:", cmd: logStr, error: err.message, port: this.getPort() });
            cmd.onError(err);
            this.sendState = SendState.Idle;
            this.currentCmd = undefined;
        };
        try {
            this.logger.logEvent({ message: "sendCommand:sending:", cmd: logStr, msg, port: this.getPort() });
            if (typeof (message) !== 'string')
                throw new Error('message must be a string');
            this.sp.write(msg + CRLF, (err) => {
                this.sendState = SendState.Receiving;
                this.currentCmd = cmd;
                if (timeout) {
                    setTimeout(() => {
                        if (this.sendState === SendState.Receiving) {
                            onError(new Error("timeout"));
                        }
                    }, timeout);
                }
                if (err)
                    onError(err);
            });
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
        this.queue.enqueue(cmd);
    }
}
exports.default = KettlerSerialComms;
