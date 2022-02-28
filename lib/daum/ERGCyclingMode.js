"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gd_eventlog_1 = require("gd-eventlog");
const CyclingMode_1 = require("../CyclingMode");
const calculations_1 = __importDefault(require("../calculations"));
const config = {
    name: "ERG",
    description: "Calculates speed based on power and slope. Power is either set by workout or calculated based on gear and cadence",
    properties: [
        { key: 'bikeType', name: 'Bike Type', description: '', type: CyclingMode_1.CyclingModeProperyType.SingleSelect, options: ['Race', 'Mountain', 'Triathlon'], default: 'Race' },
        { key: 'startPower', name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingMode_1.CyclingModeProperyType.Integer, default: 50, min: 25, max: 800 },
    ]
};
class ERGCyclingMode extends CyclingMode_1.CyclingModeBase {
    constructor(adapter, props) {
        super(adapter, props);
        this.prevUpdateTS = 0;
        this.hasBikeUpdate = false;
        this.event = {};
        this.logger = adapter.logger || new gd_eventlog_1.EventLogger('ERGMode');
        this.data = {};
        this.logger.logEvent({ message: 'constructor', props });
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
        const startPower = this.getSetting('startPower');
        return { targetPower: startPower };
    }
    sendBikeUpdate(request) {
        const getData = () => {
            if (!this.data)
                return {};
            const { gear, pedalRpm, slope, power, speed } = this.data;
            return { gear, pedalRpm, slope, power, speed };
        };
        this.logger.logEvent({ message: "processing update request", request, prev: this.prevRequest, data: getData(), event: this.event });
        let newRequest = {};
        try {
            if (!request || request.reset || Object.keys(request).length === 0) {
                this.prevRequest = {};
                return request || {};
            }
            const prevData = this.data || {};
            if (request.targetPower !== undefined) {
                delete request.slope;
                delete request.refresh;
            }
            if (this.event.starting && request.targetPower === undefined) {
                const startPower = this.getSetting('startPower');
                if (this.event.tsStart && Date.now() - this.event.tsStart > 5000) {
                    delete this.event.starting;
                    delete this.event.tsStart;
                }
                const target = this.calculateTargetPower(request);
                if (target <= startPower && (!request.minPower || target >= request.minPower)) {
                    return {};
                }
                else {
                    delete this.event.starting;
                    delete this.event.tsStart;
                }
            }
            if (request.refresh) {
                delete request.refresh;
                if (this.prevRequest !== undefined && !this.event.gearUpdated && !this.event.rpmUpdated) {
                    newRequest.targetPower = this.prevRequest.targetPower;
                }
                else {
                    newRequest.targetPower = this.calculateTargetPower(request);
                }
                if (this.prevRequest !== undefined && Object.keys(this.prevRequest).length > 0) {
                    request = Object.assign({}, this.prevRequest);
                }
                else {
                    newRequest.targetPower = this.calculateTargetPower(request);
                }
            }
            if (request.slope !== undefined) {
                if (!this.data)
                    this.data = {};
                this.data.slope = request.slope;
            }
            if (request.maxPower !== undefined && request.minPower !== undefined && request.maxPower === request.minPower) {
                request.targetPower = request.maxPower;
            }
            if (request.targetPower === undefined) {
                newRequest.targetPower = this.calculateTargetPower(request);
            }
            else {
                newRequest.targetPower = request.targetPower;
            }
            delete request.slope;
            if (request.maxPower !== undefined) {
                if (newRequest.targetPower !== undefined && newRequest.targetPower > request.maxPower) {
                    newRequest.targetPower = request.maxPower;
                }
                newRequest.maxPower = request.maxPower;
            }
            if (request.minPower !== undefined) {
                if (newRequest.targetPower !== undefined && newRequest.targetPower < request.minPower) {
                    newRequest.targetPower = request.minPower;
                }
                newRequest.minPower = request.minPower;
            }
            if (newRequest.targetPower !== undefined && prevData.power !== undefined && newRequest.targetPower === prevData.power) {
                delete newRequest.targetPower;
            }
            this.prevRequest = JSON.parse(JSON.stringify(request));
        }
        catch (err) {
            this.logger.logEvent({ message: "error", fn: 'sendBikeUpdate()', error: err.message || err, stack: err.stack });
        }
        return newRequest;
    }
    updateData(bikeData) {
        const prevData = JSON.parse(JSON.stringify(this.data || {}));
        const prevSpeed = prevData.speed;
        const prevRequest = this.prevRequest || {};
        const data = this.data || {};
        const bikeType = this.getSetting('bikeType');
        delete this.event.gearUpdated;
        delete this.event.rpmUpdated;
        if (prevData === {} || prevData.speed === undefined || prevData.speed === 0) {
            this.event.starting = true;
            this.event.tsStart = Date.now();
        }
        try {
            let rpm = bikeData.pedalRpm || 0;
            let gear = bikeData.gear || 0;
            let power = bikeData.power || 0;
            let slope = (prevData.slope !== undefined ? prevData.slope : prevRequest.slope || 0);
            let speed;
            let m = this.adapter.getWeight();
            let distanceInternal = prevData.distanceInternal || 0;
            let distance = Math.round(distanceInternal / 100);
            let ts = Date.now();
            let duration = this.prevUpdateTS === 0 ? 0 : ((ts - this.prevUpdateTS) / 1000);
            if (rpm === 0 || bikeData.isPedalling === false) {
                speed = 0;
                power = 0;
            }
            else {
                speed = calculations_1.default.calculateSpeed(m, power, slope, { bikeType });
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
            if (data.time)
                data.time += duration;
            else
                data.time = 0;
            data.heartrate = bikeData.heartrate;
            data.isPedalling = bikeData.isPedalling;
            if (gear !== prevData.gear) {
                this.event.gearUpdated = true;
            }
            if (rpm && rpm !== prevData.pedalRpm) {
                this.event.rpmUpdated = true;
            }
            this.prevUpdateTS = ts;
        }
        catch (err) {
            this.logger.logEvent({ message: 'error', fn: 'updateData()', error: err.message || err });
        }
        this.logger.logEvent({ message: "updateData result", data, bikeData, prevRequest, prevSpeed });
        this.data = data;
        return data;
    }
    calculateTargetPower(request, updateMode = true) {
        const bikeType = this.getSetting('bikeType').toLowerCase();
        const defaultPower = this.getSetting('startPower');
        let m = this.adapter.getWeight();
        const prevData = this.data || {};
        let target;
        if (prevData.pedalRpm && prevData.gear && (!updateMode || prevData.pedalRpm !== 0)) {
            const speed = calculations_1.default.calculateSpeedDaum(prevData.gear, prevData.pedalRpm, bikeType);
            var power = calculations_1.default.calculatePower(m, speed / 3.6, 0, { bikeType });
            target = Math.round(power);
        }
        else {
            target = Math.round(request.targetPower || defaultPower);
        }
        return target;
    }
}
exports.default = ERGCyclingMode;
