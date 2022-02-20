"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CyclingModeProperyType = exports.AntScanner = exports.Protocols = exports.Device = exports.INTERFACE = exports.DeviceRegistry = exports.DeviceProtocolBase = void 0;
const DeviceRegistry_1 = __importDefault(require("./DeviceRegistry"));
exports.DeviceRegistry = DeviceRegistry_1.default;
const Device_1 = __importDefault(require("./Device"));
exports.Device = Device_1.default;
const DeviceProtocol_1 = __importStar(require("./DeviceProtocol"));
exports.DeviceProtocolBase = DeviceProtocol_1.default;
Object.defineProperty(exports, "INTERFACE", { enumerable: true, get: function () { return DeviceProtocol_1.INTERFACE; } });
const Simulator_1 = __importDefault(require("./simulator/Simulator"));
const DaumPremiumProtocol_1 = __importDefault(require("./daum/premium/DaumPremiumProtocol"));
const DaumClassicProtocol_1 = __importDefault(require("./daum/classic/DaumClassicProtocol"));
const AntScanner_1 = require("./ant/AntScanner");
Object.defineProperty(exports, "AntScanner", { enumerable: true, get: function () { return AntScanner_1.AntScanner; } });
const CyclingMode_1 = require("./CyclingMode");
Object.defineProperty(exports, "CyclingModeProperyType", { enumerable: true, get: function () { return CyclingMode_1.CyclingModeProperyType; } });
const Protocols = {
    SimulatorProtocol: Simulator_1.default,
    DaumClassicProtocol: DaumClassicProtocol_1.default,
    DaumPremiumProtocol: DaumPremiumProtocol_1.default
};
exports.Protocols = Protocols;
