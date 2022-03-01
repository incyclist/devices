"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gd_eventlog_1 = require("gd-eventlog");
const CyclingMode_1 = require("../../CyclingMode");
const PowerMeterCyclingMode_1 = __importDefault(require("../PowerMeterCyclingMode"));
const config = {
    name: "Daum Classic",
    description: "The device calculates speed and power based on slope. Incyclist will not modify any values recived from the device\nThis mode will not respect maximum power and/or workout limits",
    properties: [
        { key: 'bikeType', name: 'Bike Type', description: '', type: CyclingMode_1.CyclingModeProperyType.SingleSelect, options: ['Race', 'Mountain'], default: 'Race' },
    ]
};
class DaumClassicCyclingMode extends PowerMeterCyclingMode_1.default {
    constructor(adapter, props) {
        super(adapter, props);
        this.logger = adapter ? adapter.logger : undefined;
        if (!this.logger)
            this.logger = new gd_eventlog_1.EventLogger('DaumClassic');
        this.setModeProperty('eppSupport', true);
        this.setModeProperty('setPersonSupport', true);
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
        return {};
    }
    getSettings() {
        const settings = super.getSettings();
        settings['setPerson'] = true;
        return settings;
    }
    getSetting(name) {
        if (name === 'setPerson')
            return true;
        return super.getSetting(name);
    }
    updateData(data) {
        try {
            const prevData = this.data || {};
            const prevRequest = this.prevRequest || {};
            const bikeData = JSON.parse(JSON.stringify(data));
            let power = data.power || 0;
            let speed = data.speed || 0;
            let slope = (prevData.slope !== undefined ? prevData.slope : prevRequest.slope || 0);
            let distanceBike = data.distanceInternal || 0;
            let distancePrev = prevData.distanceInternal || 0;
            let distanceInternal = distanceBike;
            let ts = Date.now();
            if (!bikeData.pedalRpm || bikeData.isPedalling === false) {
                speed = 0;
                power = 0;
            }
            if (distanceBike < distancePrev) {
                this.logger.logEvent({ message: '~~~ distance overflow', distanceBike, distancePrev });
                let v = speed / 3.6;
                let duration = this.prevUpdateTS === 0 ? 0 : ((ts - this.prevUpdateTS) / 1000);
                distanceInternal = distancePrev + Math.round(v * duration);
            }
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal);
            data.distance = Math.round(distanceInternal / 100);
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
exports.default = DaumClassicCyclingMode;
