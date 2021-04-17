"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_UPDATE_FREQUENCY = void 0;
const Device_1 = require("../Device");
exports.DEFAULT_UPDATE_FREQUENCY = 1000;
class AntAdapter extends Device_1.default {
    constructor(protocol) {
        super(protocol);
        this.paused = false;
        this.ignoreHrm = false;
        this.ignoreBike = false;
        this.ignorePower = false;
        this.deviceID = undefined;
        this.port = undefined;
        this.stick = undefined;
        this.channel = -1;
        this.deviceData = {};
        this.data = {};
        this.updateFrequency = exports.DEFAULT_UPDATE_FREQUENCY;
    }
    setSensor(sensor) {
        this.sensor = sensor;
    }
    getID() {
        return this.deviceID;
    }
    setIgnoreHrm(ignore) {
        this.ignoreHrm = ignore;
    }
    setIgnoreBike(ignore) {
        this.ignoreBike = ignore;
    }
    setIgnorePower(ignore) {
        this.ignorePower = ignore;
    }
    getProfile() { }
    getPort() {
        return this.port;
    }
    setChannel(channel) {
        console.log('~~setChannel', this.getName(), channel);
        this.channel = channel;
    }
    setStick(stick) {
        this.stick = stick;
    }
    onDeviceData(data) { }
    onDeviceEvent(data) { }
    onAttached() { }
    update() { }
    check() { }
    connect() { }
    close() { }
    pause() {
        return new Promise(resolve => {
            this.paused = true;
            resolve(true);
        });
    }
    resume() {
        return new Promise(resolve => {
            this.paused = false;
            resolve(true);
        });
    }
}
exports.default = AntAdapter;
