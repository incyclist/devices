"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DeviceAdapterBase {
    constructor(proto) {
        this.protocol = proto;
        this.detected = false;
        this.selected = false;
        this.onDataFn = undefined;
    }
    isBike() { throw new Error('not implemented'); }
    isPower() { throw new Error('not implemented'); }
    isHrm() { throw new Error('not implemented'); }
    getID() { throw new Error('not implemented'); }
    getDisplayName() { return this.getName(); }
    getName() { throw new Error('not implemented'); }
    getPort() { throw new Error('not implemented'); }
    getProtocol() { return this.protocol; }
    getProtocolName() {
        return this.protocol ? this.protocol.getName() : undefined;
    }
    setCyclingMode(mode, settings) { }
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
exports.default = DeviceAdapterBase;
