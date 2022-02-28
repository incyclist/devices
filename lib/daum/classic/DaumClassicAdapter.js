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
    getSupportedCyclingModes() {
        const supported = super.getSupportedCyclingModes();
        supported.push(DaumClassicCyclingMode_1.default);
        return supported;
    }
    getDefaultCyclingMode() {
        return new DaumClassicCyclingMode_1.default(this);
    }
    check() {
        var info = {};
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: "check()", port: this.getPort() });
            const iv = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                reject(new Error(`timeout`));
            }), 5000);
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
                clearTimeout(iv);
                resolve(info);
            }
            catch (err) {
                clearTimeout(iv);
                reject(err);
            }
        }));
    }
    start(props) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.logEvent({ message: 'start()', props });
            const opts = props || {};
            const { user } = props;
            this.initData();
            let startState = {};
            return (0, utils_1.runWithRetries)(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (!this.bike.isConnected())
                        yield this.bike.saveConnect();
                    yield this.getBike().resetDevice();
                    if (!startState.setProg) {
                        yield this.getBike().setProg(0);
                        startState.setProg = true;
                    }
                    if (!startState.setPerson) {
                        yield this.getBike().setPerson(user);
                        startState.setPerson = true;
                    }
                    if (!startState.startProg) {
                        yield this.getBike().startProg();
                        startState.startProg = true;
                    }
                    if (!startState.setGear) {
                        yield this.bike.setGear(this.data.gear || (opts.gear || 10));
                        startState.setGear = true;
                    }
                    const startRequest = this.getCyclingMode().getBikeInitRequest();
                    yield this.sendRequest(startRequest);
                    startState.checkRunData = true;
                    const data = yield this.bike.runData();
                    if (startRequest.targetPower && startRequest.targetPower !== 25 && data.power === 25) {
                        throw new Error('invalid device response: runData');
                    }
                    return data;
                }
                catch (err) {
                    if (startState.checkRunData) {
                        startState = {};
                    }
                    throw (new Error(`could not start device, reason:${err.message}`));
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
}
exports.default = DaumClassicAdapter;
DaumClassicAdapter.NAME = PROTOCOL_NAME;
