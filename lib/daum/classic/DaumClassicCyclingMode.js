"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gd_eventlog_1 = require("gd-eventlog");
const CyclingMode_1 = require("../../CyclingMode");
const SmartTrainerCyclingMode_1 = __importDefault(require("../SmartTrainerCyclingMode"));
const config = {
    name: "Daum Classic",
    description: "The device calculates speed and power based on slope. Incyclist will not modify any values recived from the device\nThis mode will not respect maximum power and/or workout limits",
    properties: [
        { key: 'bikeType', name: 'Bike Type', description: '', type: CyclingMode_1.CyclingModeProperyType.SingleSelect, options: ['Race', 'Mountain'], default: 'Race' },
    ]
};
class DaumClassicCyclingMode extends SmartTrainerCyclingMode_1.default {
    constructor(adapter, props) {
        super(adapter, props);
        this.logger = adapter ? adapter.logger : undefined;
        if (!this.logger)
            this.logger = new gd_eventlog_1.EventLogger('DaumClassic');
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
        const getData = () => {
            if (!this.data)
                return {};
            const { gear, pedalRpm, slope, power, speed } = this.data;
            return { gear, pedalRpm, slope, power, speed };
        };
        const event = Object.assign({}, this.event);
        if (this.data === undefined)
            event.noData = true;
        if (request.slope !== undefined && (event.noData || Math.abs(request.slope - this.data.slope) >= 0.1))
            event.slopeUpdate = true;
        if (this.prevRequest === undefined)
            event.initialCall = true;
        this.logger.logEvent({ message: "processing update request", request, prev: this.prevRequest, data: getData(), event });
        let newRequest = {};
        if (request.slope === undefined && request.refresh && this.prevRequest) {
            return this.prevRequest;
        }
        if (request.slope !== undefined) {
            newRequest.slope = parseFloat(request.slope.toFixed(1));
            this.data.slope = newRequest.slope;
        }
        this.prevRequest = JSON.parse(JSON.stringify(newRequest));
        return newRequest;
    }
    updateData(data) {
        try {
            const prevData = this.data || {};
            const prevRequest = this.prevRequest || {};
            const bikeData = JSON.parse(JSON.stringify(data));
            let power = bikeData.power || 0;
            let slope = (prevData.slope !== undefined ? prevData.slope : prevRequest.slope || 0);
            let speed = bikeData.speed || 0;
            let distanceInternal = prevData.distanceInternal || 0;
            let ts = Date.now();
            if (bikeData.pedalRpm === 0 || bikeData.isPedalling === false) {
                speed = 0;
                power = 0;
            }
            else {
                const duration = this.prevUpdateTS === 0 ? 0 : ((ts - this.prevUpdateTS) / 1000);
                let v = speed / 3.6;
                distanceInternal += Math.round(v * duration);
            }
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.slope = slope;
            data.distanceInternal = distanceInternal;
            data.distance = Math.round(distanceInternal / 100);
            this.logger.logEvent({ message: "updateData result", data, bikeData, prevRequest: this.prevRequest || {}, prevSpeed: prevData.speed, event: this.event });
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
