"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Emulator = void 0;
__exportStar(require("./characteristics/characteristic.js"), exports);
__exportStar(require("./types.js"), exports);
const events_1 = require("events");
const csp_js_1 = __importDefault(require("./services/csp.js"));
const ftms_js_1 = require("./services/ftms.js");
const hrs_js_1 = require("./services/hrs.js");
const DEFAULT_FREQUENCY = 250;
class Emulator extends events_1.EventEmitter {
    constructor(options = {}) {
        var _a;
        super();
        this.power = 0;
        this.speed = 0;
        this.cadence = 0;
        this.heartrate = 0;
        this.frequency = DEFAULT_FREQUENCY;
        this.frequency = options.frequency || DEFAULT_FREQUENCY;
        this.name = (_a = options.name) !== null && _a !== void 0 ? _a : "Emulator";
        this.hrs = new hrs_js_1.HeartRateService();
        this.csp = options.disableCps ? null : new csp_js_1.default();
        this.ftms = new ftms_js_1.FitnessMachineService();
        this.last_timestamp = 0;
        this.rev_count = 0;
    }
    getServices() {
        return [this.ftms, this.csp, this.hrs].filter(s => s !== null);
    }
    start() {
        this.last_timestamp = Date.now();
        this.getServices().forEach(s => s.start(this.frequency));
    }
    update(DataUpdate) {
        const t = Date.now() - this.last_timestamp;
        const updateServices = () => {
            var _a;
            (_a = this.csp) === null || _a === void 0 ? void 0 : _a.cyclingPowerMeasurement.update({
                watts: this.power,
                heartrate: this.heartrate,
                rev_count: this.rev_count
            });
            this.ftms.indoorBikeData.update({
                watts: this.power,
                cadence: this.cadence,
                heart_rate: this.heartrate
            });
            this.hrs.heartRateMeasurement.update({
                heart_rate: this.heartrate
            });
        };
        if ('cadence' in DataUpdate)
            this.cadence = DataUpdate.cadence;
        if (this.cadence > 0)
            this.rev_count += Math.round(this.cadence / 60 * t / 1000);
        if ('power' in DataUpdate) {
            this.power = DataUpdate.power;
        }
        if ('speed' in DataUpdate)
            this.speed = DataUpdate.speed;
        if ('heartrate' in DataUpdate) {
            this.heartrate = DataUpdate.heartrate;
        }
        updateServices();
    }
}
exports.Emulator = Emulator;
//# sourceMappingURL=index.js.map