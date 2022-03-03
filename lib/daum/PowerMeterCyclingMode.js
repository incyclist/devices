"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gd_eventlog_1 = require("gd-eventlog");
const CyclingMode_1 = require("../CyclingMode");
const calculations_1 = __importDefault(require("../calculations"));
const config = {
    name: "PowerMeter",
    description: "Power and cadence are taken from device. Speed is calculated from power and current slope\nThis mode will not respect maximum power and/or workout limits",
    properties: []
};
class PowerMeterCyclingMode extends CyclingMode_1.CyclingModeBase {
    constructor(adapter, props) {
        super(adapter, props);
        this.prevUpdateTS = 0;
        this.hasBikeUpdate = false;
        this.logger = adapter ? adapter.logger : undefined;
        if (!this.logger)
            this.logger = new gd_eventlog_1.EventLogger('PowerMeter');
    }
    getName() {
        return config.name;
    }
    getDescription() {
        return config.description;
    }
    getProperties() {
        return config.properties;
    }
    getProperty(name) {
        return config.properties.find(p => p.name === name);
    }
    getBikeInitRequest() {
        return { slope: 0 };
    }
    sendBikeUpdate(request) {
        if (request.slope)
            this.data.slope = request.slope;
        this.logger.logEvent({ message: "processing update request", request, prev: this.prevRequest });
        this.prevRequest = {};
        return {};
    }
    updateData(data) {
        try {
            const prevData = this.data || {};
            const prevRequest = this.prevRequest || {};
            const bikeData = JSON.parse(JSON.stringify(data));
            let power = data.power || 0;
            let speed = data.speed || 0;
            let slope = (prevData.slope !== undefined ? prevData.slope : prevRequest.slope || 0);
            let distanceInternal = prevData.distanceInternal || 0;
            if (!bikeData.pedalRpm || bikeData.isPedalling === false) {
                speed = 0;
                power = 0;
            }
            let ts = Date.now();
            const m = this.adapter.getWeight();
            speed = calculations_1.default.calculateSpeed(m, power, slope);
            let v = speed / 3.6;
            let duration = this.prevUpdateTS === 0 ? 0 : ((ts - this.prevUpdateTS) / 1000);
            distanceInternal += Math.round(v * duration);
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal);
            data.slope = slope;
            this.logger.logEvent({ message: "updateData result", data, bikeData, prevRequest: {}, prevSpeed: prevData.speed });
            this.data = JSON.parse(JSON.stringify(data));
            this.prevUpdateTS = ts;
        }
        catch (err) {
            this.logger.logEvent({ message: 'error', fn: 'updateData()', error: err.message || err });
        }
        return data;
    }
}
exports.default = PowerMeterCyclingMode;
