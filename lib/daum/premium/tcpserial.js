"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const net_1 = __importDefault(require("net"));
const gd_eventlog_1 = require("gd-eventlog");
const TIMEOUT_OPEN = 1000;
var __responses = {};
class TcpSocketPort {
    constructor(props) {
        this.callbacks = {};
        this.isOpen = false;
        this.isClosed = false;
        this.props = props || {};
        this.logger = new gd_eventlog_1.EventLogger('TCPSocket') || props.logger;
        this.enabled = this.props.enabled || true;
        this.host = this.props.host || '127.0.0.1';
        this.port = this.props.port || 10000;
        this.net = this.props.net || net_1.default;
        this.path = `${this.host}:${this.port}`;
        if (this.enabled)
            this.socket = new this.net.Socket();
        this.outputQueue = [];
        this.iv = undefined;
    }
    flush() {
    }
    open(retry = false) {
        try {
            if (!retry) {
                this.id = Date.now();
                this.socket.on('timeout', () => { this.onTimeout(); });
                this.socket.on('connect', () => { this.onConnect(); });
                this.socket.on('error', (err) => { this.onError(err); });
                this.socket.on('ready', () => {
                    this.logger.logEvent({ message: 'ready' });
                });
            }
            this.logger.logEvent({ message: 'opening', id: this.id, retry });
            this.socket.connect(this.port, this.host);
        }
        catch (err) {
            this.logger.logEvent({ message: 'opening error', id: this.id, error: err.message, stack: err.stack });
            this.emit('error', err);
        }
    }
    close() {
        this.logger.logEvent({ message: 'closing', id: this.id });
        this.isOpen = false;
        this.isClosed = true;
        try {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket.on('error', () => { });
        }
        catch (err) {
            console.log(err);
        }
        this.emit('close');
        setTimeout(() => { this.removeAllListeners(); }, 100);
    }
    onTimeout() {
        if (this.isOpen)
            return;
        this.logger.logEvent({ message: 'timeout', id: this.id });
        try {
            this.socket.end();
        }
        catch (_a) { }
        if (this.isClosed)
            return;
        this.emit('error', new Error('timeout'));
    }
    onConnect() {
        this.logger.logEvent({ message: 'connected', id: this.id });
        this.isOpen = true;
        this.isClosed = false;
        this.emit('open');
    }
    onError(err) {
        this.logger.logEvent({ message: 'error', error: err.message });
        if (this.callbacks['error'])
            this.callbacks['error'](err);
    }
    on(event, callback) {
        if (event === 'open' || event === 'close' || event === 'error') {
            this.callbacks[event] = callback;
            return;
        }
        this.socket.on(event, callback);
    }
    removeAllListeners() {
        this.callbacks = {};
    }
    emit(event, ...args) {
        if (event === 'open' || event === 'close' || event === 'error') {
            if (this.callbacks[event])
                this.callbacks[event](...args);
        }
    }
    write(message) {
        this.socket.write(new Uint8Array(message));
    }
    unpipe() {
        delete this.callbacks['data'];
        this.socket.unpipe();
    }
    pipe(transformer) {
        return this.socket.pipe(transformer);
    }
    static setResponse(command, fn) {
        if (!__responses)
            this.reset();
        __responses[command] = fn;
    }
    static getReponseHandler(command) {
        return __responses[command];
    }
    static reset() {
        __responses = {};
    }
}
exports.default = TcpSocketPort;
