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
const DaumClassicCyclingMode_1 = __importDefault(require("./DaumClassicCyclingMode"));
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
    getInterface() {
        return this.bike.getInterface();
    }
    getSupportedCyclingModes() {
        const supported = super.getSupportedCyclingModes();
        supported.push(DaumClassicCyclingMode_1.default);
        return supported;
    }
    check() {
        var info = {};
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: "check()", port: this.getPort() });
            if (this.isStopped())
                reject(new Error("device is stopped"));
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
            this.logger.logEvent({ message: 'start()' });
            console.log('~~~setPersonSupport:', this.getCyclingMode().getModeProperty('setPersonSupport'));
            console.log('~~~eppSupport:', this.getCyclingMode().getModeProperty('eppSupport'));
            const opts = props || {};
            const user = opts.user || this.userSettings;
            const route = opts.route;
            var info = {};
            this.initData();
            return utils_1.runWithRetries(() => __awaiter(this, void 0, void 0, function* () {
                if (this.isStopped())
                    return;
                try {
                    if (!this.bike.isConnected()) {
                        yield this.bike.saveConnect();
                    }
                    if (!info.deviceType) {
                        info.deviceType = yield this.bike.getDeviceType();
                    }
                    if (!info.version) {
                        info.version = yield this.bike.getProtocolVersion();
                    }
                    if (this.getCyclingMode().getModeProperty('eppSupport')) {
                        const bikeType = this.getCyclingMode().getSetting('bikeType');
                        if (!info.upload)
                            info.upload = yield this.bike.programUpload(bikeType, route, props.onStatusUpdate);
                        if (!info.started) {
                            const programId = route ? route.programId : 0;
                            info.started = yield this.bike.startProgram(programId);
                        }
                    }
                    if (!info.person && this.getCyclingMode().getModeProperty('setPersonSupport')) {
                        info.person = yield this.bike.setPerson(user);
                    }
                    if (!this.getCyclingMode().getModeProperty('eppSupport')) {
                        const gear = yield this.bike.setGear(this.daumRunData.gear || (opts.gear || 10));
                        return gear;
                    }
                    return;
                }
                catch (err) {
                    console.error(err);
                    throw (new Error(`could not start device, reason:${err.message}`));
                }
            }), 5, 1500)
                .then(data => {
                this.startUpdatePull();
                return data;
            });
        });
    }
    getCurrentBikeData() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.bike.isConnected()) {
                yield this.bike.saveConnect();
            }
            return this.getBike().getTrainingData();
        });
    }
}
exports.default = DaumPremiumDevice;
DaumPremiumDevice.NAME = PROTOCOL_NAME;
