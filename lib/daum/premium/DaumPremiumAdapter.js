"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gd_eventlog_1 = require("gd-eventlog");
const utils_1 = require("../../utils");
const DaumAdapter_1 = __importDefault(require("../DaumAdapter"));
const PROTOCOL_NAME = "Daum Premium";
class DaumPremiumDevice extends DaumAdapter_1.default {
    constructor(protocol, bike) {
        super(protocol, bike);
        this.bike = bike;
        this.logger = new gd_eventlog_1.EventLogger('DaumPremium');
        this.ignoreHrm = false;
        this.ignorePower = false;
        this.ignoreBike = false;
        this.paused = undefined;
        this.iv = undefined;
        this.distanceInternal = undefined;
        this.initData();
    }
    getName() {
        return 'Daum8i';
    }
    getPort() {
        return this.bike.getPort();
    }
    check() {
        var info = {};
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: "check()", port: this.getPort() });
            try {
                if (!this.bike.isConnected())
                    yield this.bike.saveConnect();
                info.deviceType = yield this.bike.getDeviceType();
                info.version = yield this.bike.getProtocolVersion();
                resolve(info);
            }
            catch (err) {
                reject(err);
            }
        }));
    }
    start(props) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: 'start()', props });
            const opts = props || {};
            this.initData();
            return utils_1.runWithRetries(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const gear = yield this.bike.setGear(this.data.gear || (opts.gear || 10));
                    return gear;
                }
                catch (err) {
                    throw err;
                }
            }), 3, 11000)
                .then(data => {
                this.startUpdatePull();
                return data;
            });
        });
    }
    getCurrentBikeData() {
        return this.getBike().getTrainingData();
    }
    updateData(data, bikeData) {
        data.isPedalling = bikeData.cadence > 0;
        data.power = bikeData.power;
        data.pedalRpm = bikeData.cadence;
        data.speed = bikeData.speed;
        data.heartrate = bikeData.heartrate;
        data.distance = bikeData.distance / 1000;
        data.distanceInternal = bikeData.distance;
        data.time = bikeData.time;
        data.gear = bikeData.gear;
        if (this.bike.processor !== undefined) {
            data = this.bike.processor.getValues(data);
        }
        return data;
    }
}
exports.default = DaumPremiumDevice;
DaumPremiumDevice.NAME = PROTOCOL_NAME;
