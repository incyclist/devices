"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const DeviceRegistry_1 = __importDefault(require("./DeviceRegistry"));
exports.DeviceRegistry = DeviceRegistry_1.default;
const Device_1 = __importDefault(require("./Device"));
exports.Device = Device_1.default;
const DeviceProtocol_1 = __importStar(require("./DeviceProtocol"));
exports.DeviceProtocolBase = DeviceProtocol_1.default;
exports.INTERFACE = DeviceProtocol_1.INTERFACE;
const Simulator_1 = __importDefault(require("./simulator/Simulator"));
const DaumPremiumProtocol_1 = __importDefault(require("./daum/premium/DaumPremiumProtocol"));
const DaumClassicProtocol_1 = __importDefault(require("./daum/classic/DaumClassicProtocol"));
const protocol_1 = __importDefault(require("./kettler/ergo-racer/protocol"));
const AntScanner_1 = require("./ant/AntScanner");
exports.AntScanner = AntScanner_1.AntScanner;
const CyclingMode_1 = require("./CyclingMode");
exports.CyclingModeProperyType = CyclingMode_1.CyclingModeProperyType;
const Protocols = {
    SimulatorProtocol: Simulator_1.default,
    DaumClassicProtocol: DaumClassicProtocol_1.default,
    DaumPremiumProtocol: DaumPremiumProtocol_1.default,
    KettlerRacerProtocol: protocol_1.default,
};
exports.Protocols = Protocols;
