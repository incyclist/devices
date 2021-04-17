"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Device {
    constructor(proto) {
        this.protocol = proto;
        this.detected = false;
        this.selected = false;
        this.onDataFn = undefined;
    }
    getID() { }
    getDisplayName() { return this.getName(); }
    getName() { }
    getPort() { }
    getProtocol() {
        return this.protocol;
    }
    getProtocolName() {
        return this.protocol ? this.protocol.getName() : undefined;
    }
    setIgnoreHrm(ignore) { }
    setIgnorePower(ignore) { }
    setIgnoreBike(ignore) { }
    select() { this.selected = true; }
    unselect() { this.selected = false; }
    isSelected() { return this.selected; }
    setDetected(detected = true) { this.detected = detected; }
    isDetected() { return this.detected; }
    update() { }
    check() { }
    connect() { }
    close() { }
    start(props) { throw new Error('not implemented'); }
    stop() { throw new Error('not implemented'); }
    pause() { throw new Error('not implemented'); }
    resume() { throw new Error('not implemented'); }
    sendUpdate(request) { }
    onData(callback) {
        this.onDataFn = callback;
    }
}
exports.default = Device;
