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
const PROTOCOL_NAME = "Daum Classic";
class DaumClassicAdapter extends DaumAdapter_1.default {
    constructor(protocol, bike) {
        super(protocol, bike);
        this.logger = new gd_eventlog_1.EventLogger('DaumClassic');
        this.name = PROTOCOL_NAME;
        this.ignoreHrm = false;
        this.ignorePower = false;
        this.ignoreBike = false;
        this.paused = undefined;
        this.iv = undefined;
        this.distanceInternal = undefined;
        this.initData();
    }
    setID(id) {
        this.id = id;
    }
    getID() {
        return this.id;
    }
    getName() {
        return this.name;
    }
    setName(name) {
        this.name = name || PROTOCOL_NAME;
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
                const address = yield this.bike.getAddress();
                info.bikeNo = address.bike;
                const version = yield this.bike.getVersion();
                info.serialNo = version.serialNo;
                info.cockpit = version.cockpit;
                this.setName('Daum ' + info.cockpit);
                this.setID(info.serialNo);
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
            const person = props;
            this.initData();
            return utils_1.runWithRetries(() => __awaiter(this, void 0, void 0, function* () {
                const state = {};
                try {
                    if (!state.reset) {
                        yield this.getBike().resetDevice();
                        state.reset = true;
                    }
                    if (!state.startProg) {
                        yield this.getBike().startProg();
                        state.startProg = true;
                    }
                    if (!state.setProg) {
                        yield this.getBike().setProg(0);
                        state.setProg = true;
                    }
                    if (!state.setPerson) {
                        yield this.getBike().setPerson({ person });
                        state.setPerson = true;
                    }
                    return yield this.bike.setGear(this.data.gear || (opts.gear || 10));
                }
                catch (err) {
                    throw (err);
                }
            }), 5, 1000)
                .then(data => {
                this.startUpdatePull();
                return data;
            });
        });
    }
    getCurrentBikeData() {
        return this.getBike().runData();
    }
    updateData(data, bikeData) {
        data.isPedalling = bikeData.cadence > 0;
        data.power = bikeData.power;
        data.pedalRpm = bikeData.cadence;
        data.speed = bikeData.speed;
        data.heartrate = bikeData.heartrate;
        data.distance = bikeData.distance / 100;
        data.distanceInternal = bikeData.distance;
        data.time = bikeData.time;
        data.gear = bikeData.gear;
        if (this.bike.processor !== undefined) {
            data = this.bike.processor.getValues(data);
        }
        return data;
    }
}
exports.default = DaumClassicAdapter;
DaumClassicAdapter.NAME = PROTOCOL_NAME;
