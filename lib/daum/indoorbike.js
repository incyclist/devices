"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const calculations_1 = __importDefault(require("../calculations"));
const gd_eventlog_1 = require("gd-eventlog");
const constants_1 = require("./constants");
const DEFAULT_BIKE_WEIGHT = 10;
const DEFAULT_USER_WEIGHT = 75;
class IndoorBikeProcessor {
    constructor(bike, opts) {
        const props = opts || {};
        this.bike = bike;
        this.prevTS = 0;
        this.prevDistance = 0;
        this.prevRpm = 0;
        this.prevSpeed = 0;
        this.prevPower = 0;
        this.prevGear = undefined;
        this.prevSlope = 0;
        this.prevSettings = undefined;
        this.hasBikeUpdate = false;
        this.lastUpdate = {};
        this.logger = props.logger || new gd_eventlog_1.EventLogger('IndoorBike');
    }
    setValues(data) {
        this.logger.logEvent({ message: "setValues request", data, prev: this.prevSettings });
        try {
            if (this.bike === undefined || this.bike.settings === undefined) {
                this.logger.logEvent({ message: "setValues result (no bike)", data });
                return data;
            }
            if (!data || data.reset || Object.keys(data).length === 0) {
                this.prevSettings = undefined;
                return data;
            }
            if (data.refresh) {
                if (this.prevSettings !== undefined)
                    return this.prevSettings;
                else {
                    return this.caclulateTargetPower(data);
                }
            }
            let updateMode = false;
            const isSlopeUpdate = data.slope !== undefined && Object.keys(data).length === 1;
            if (data.slope === undefined && data.targetPower === undefined && data.minPower === undefined && data.maxPower === undefined) {
                data.slope = this.prevSlope;
                updateMode = true;
            }
            if (data.targetPower !== undefined) {
                data.slope = undefined;
                this.bike.settings.targetPower = data.targetPower;
            }
            else if (data.maxPower !== undefined && data.minPower !== undefined && data.maxPower === data.minPower) {
                data.targetPower = data.maxPower;
                data.slope = undefined;
                this.bike.settings.targetPower = data.targetPower;
            }
            else {
                if (data.slope !== undefined || this.prevSlope !== undefined) {
                    this.bike.settings.slope = data.slope !== undefined ? data.slope : this.prevSlope;
                    data = this.caclulateTargetPower(data, updateMode);
                }
                if (data.maxPower !== undefined) {
                    this.bike.settings.maxPower = data.maxPower;
                    if (data.targetPower !== undefined && data.targetPower > data.maxPower) {
                        data.targetPower = data.maxPower;
                    }
                }
                if (data.minPower !== undefined) {
                    this.bike.settings.minPower = data.minPower;
                    if (data.targetPower !== undefined && data.targetPower < data.minPower) {
                        data.targetPower = data.minPower;
                    }
                }
                if (data.targetPower !== undefined) {
                    this.bike.settings.targetPower = data.targetPower;
                }
            }
            if (!isSlopeUpdate)
                this.prevSettings = JSON.parse(JSON.stringify(data));
        }
        catch (err) {
            this.logger.logEvent({ message: "setValues Exception", error: err.message, stack: err.stack });
        }
        this.logger.logEvent({ message: "setValues result", data });
        return data;
    }
    isAccelMode() {
        if (!this.bike || !this.bike.settings)
            return false;
        return this.bike.settings.accelMode;
    }
    getSlope(data) {
        if (data.slope !== undefined && data.slope !== null)
            return data.slope;
        if (!this.bike || !this.bike.settings || !this.bike.settings.slope)
            return 0;
        return parseFloat(this.bike.settings.slope.toFixed(1));
    }
    getBikeType(props) {
        if (props.bikeType)
            return props.bikeType;
        if (!this.bike || !this.bike.settings || this.bike.settings.bikeType === undefined)
            return constants_1.ACTUAL_BIKE_TYPE.RACE;
    }
    getWeight(props) {
        if (props.bikeWeight || props.userWeight) {
            const bikeWeight = props.bikeWeight || DEFAULT_BIKE_WEIGHT;
            const userWeight = props.userWeight || DEFAULT_USER_WEIGHT;
            return bikeWeight + userWeight;
        }
        if (!this.bike)
            return DEFAULT_BIKE_WEIGHT + DEFAULT_USER_WEIGHT;
        return this.bike.getUserWeight() + this.bike.getBikeWeight();
    }
    getValues(data, props = {}) {
        this.logger.logEvent({ message: "getValues request", data });
        try {
            let rpm = data.pedalRpm;
            let gear = data.gear;
            let power = data.power;
            let slope = this.getSlope(data);
            let speed = data.speed;
            let m = this.getWeight(props);
            let distanceInternal = this.prevDistance;
            let distance = Math.round(distanceInternal / 100);
            let ts = Date.now();
            let duration = this.prevTS === 0 ? 0 : ((ts - this.prevTS) / 1000);
            if (rpm === 0 || data.isPedalling === false) {
                speed = 0;
                power = 0;
            }
            else {
                if (duration > 0) {
                    speed = calculations_1.default.calculateSpeed(m, power, slope);
                }
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
            if (gear !== this.prevGear || (this.lastUpdate.rpm && Math.abs(rpm - this.lastUpdate.rpm) > 2)) {
                this.hasBikeUpdate = true;
                this.lastUpdate.rpm = rpm;
            }
            this.prevDistance = distanceInternal;
            this.prevTS = ts;
            this.prevSpeed = speed;
            this.prevPower = power;
            this.prevSlope = slope;
            this.prevGear = gear;
            this.prevRpm = rpm;
        }
        catch (error) {
            this.logger.logEvent({ message: 'Error', error });
        }
        this.logger.logEvent({ message: "getValues result", data, settings: this.bike.settings });
        return data;
    }
    caclulateTargetPower(data, updateMode = true) {
        let bike = this.bike;
        let bikeType = bike.settings.bikeType;
        let m = bike.getUserWeight() + bike.getBikeWeight();
        if (this.prevRpm !== undefined && (!updateMode || this.prevRpm !== 0) && this.prevGear !== undefined) {
            var speed = calculations_1.default.calculateSpeedDaum(this.prevGear, this.prevRpm, bikeType);
            var power = calculations_1.default.calculatePower(m, speed / 3.6, 0);
            data.targetPower = power;
        }
        else {
            data.targetPower = this.bike.settings.targetPower || 50;
        }
        data.slope = undefined;
        return data;
    }
}
exports.default = IndoorBikeProcessor;
