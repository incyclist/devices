"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gd_eventlog_1 = require("gd-eventlog");
const CyclingMode_1 = require("../CyclingMode");
const calculations_1 = __importDefault(require("../calculations"));
const config = {
    name: "Ergometer mode",
    description: "Calculates speed based on power and slope. Power is calculated from gear and cadence",
    properties: [
        { key: 'startPower', name: 'Starting Power', description: 'Starting power in watts', type: CyclingMode_1.CyclingModeProperyType.Integer, default: 50 }
    ]
};
class ERGCyclingMode {
    constructor(adapter, props) {
        this.prevUpdateTS = 0;
        this.hasBikeUpdate = false;
        this.settings = {};
        this.setAdapter(adapter);
        this.logger = new gd_eventlog_1.EventLogger('ERGMode');
        this.settings = props || {};
    }
    setAdapter(adapter) {
        this.adapter = adapter;
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
    setSetting(name, value) {
        this.settings[name] = value;
    }
    getSetting(name) {
        const res = this.settings[name];
        if (res !== undefined)
            return res;
        const prop = this.getProperties().find(p => p.key === name);
        if (prop && prop.default)
            return prop.default;
        return undefined;
    }
    sendBikeUpdate(request) {
        this.logger.logEvent({ message: "setValues request", request, prev: this.prevRequest });
        try {
            if (!request || request.reset || Object.keys(request).length === 0) {
                this.prevRequest = undefined;
                return request;
            }
            if (request.refresh) {
                if (this.prevRequest !== undefined && !this.hasBikeUpdate) {
                    request.slope = this.prevRequest.slope;
                    request.targetPower = this.prevRequest.targetPower;
                    request.minPower = this.prevRequest.minPower;
                    request.maxPower = this.prevRequest.maxPower;
                    return request;
                }
                else {
                    return this.calculateTargetPower(request);
                }
            }
            const isSlopeUpdate = request.slope !== undefined && Object.keys(request).length === 1;
            if (request.targetPower !== undefined) {
                delete request.slope;
            }
            else if (request.maxPower !== undefined && request.minPower !== undefined && request.maxPower === request.minPower) {
                request.targetPower = request.maxPower;
                delete request.slope;
            }
            else {
                if (request.slope !== undefined || (this.prevData !== undefined && this.prevData.slope !== undefined)) {
                    request = this.calculateTargetPower(request, false);
                }
                if (request.maxPower !== undefined) {
                    if (request.targetPower !== undefined && request.targetPower > request.maxPower) {
                        request.targetPower = request.maxPower;
                    }
                }
                if (request.minPower !== undefined) {
                    if (request.targetPower !== undefined && request.targetPower < request.minPower) {
                        request.targetPower = request.minPower;
                    }
                }
            }
            if (!isSlopeUpdate)
                this.prevRequest = JSON.parse(JSON.stringify(request));
        }
        catch (err) {
            this.logger.logEvent({ message: "setValues Exception", error: err.message, stack: err.stack });
        }
        this.logger.logEvent({ message: "setValues result", data: request });
        this.hasBikeUpdate = false;
        return request;
    }
    updateData(data) {
        this.logger.logEvent({ message: "updateData", data });
        const getSlope = () => {
            if (data.slope)
                return data.slope;
            if (this.prevData && this.prevData.slope)
                return this.prevData.slope;
            if (this.prevRequest && this.prevRequest.slope)
                return this.prevRequest.slope;
            return 0;
        };
        try {
            const prevData = this.prevData || {};
            let rpm = data.pedalRpm || 0;
            let gear = data.gear || 0;
            let power = data.power || 0;
            let slope = getSlope();
            let speed = data.speed || 0;
            let m = this.adapter.getWeight();
            let distanceInternal = prevData.distanceInternal || 0;
            let distance = Math.round(distanceInternal / 100);
            let ts = Date.now();
            let duration = this.prevUpdateTS === 0 ? 0 : ((ts - this.prevUpdateTS) / 1000);
            if (rpm === 0 || data.isPedalling === false) {
                speed = 0;
                power = 0;
            }
            else {
                speed = calculations_1.default.calculateSpeed(m, power, slope);
                let v = speed / 3.6;
                distanceInternal += Math.round(v * duration);
                distance = Math.round(distanceInternal / 100);
            }
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal);
            data.distance = distance;
            data.slope = slope;
            data.pedalRpm = rpm;
            data.gear = gear;
            if (this.prevData === undefined || gear !== prevData.gear || rpm !== prevData.pedalRpm) {
                this.hasBikeUpdate = true;
            }
            this.prevData = data;
            this.prevUpdateTS = ts;
        }
        catch (err) {
            this.logger.logEvent({ message: 'error', fn: 'updateData()', error: err.message || err });
        }
        this.logger.logEvent({ message: "updateData result", data });
        return data;
    }
    calculateTargetPower(request, updateMode = true) {
        const bikeType = 'race';
        const defaultPower = this.getSetting('startPower');
        const m = this.adapter.getWeight();
        const prevData = this.prevData || {};
        if (prevData.pedalRpm !== undefined && prevData.gear !== undefined && (!updateMode || prevData.pedalRpm !== 0)) {
            var speed = calculations_1.default.calculateSpeedDaum(prevData.gear, prevData.pedalRpm, bikeType);
            var power = calculations_1.default.calculatePower(m, speed / 3.6, 0);
            request.targetPower = power;
        }
        else {
            request.targetPower = request.targetPower || defaultPower;
        }
        delete request.slope;
        return request;
    }
}
exports.default = ERGCyclingMode;
