"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AntScanner = exports.Protocols = exports.Device = exports.INTERFACE = exports.DeviceRegistry = exports.DeviceProtocol = void 0;
const DeviceRegistry_1 = require("./DeviceRegistry");
exports.DeviceRegistry = DeviceRegistry_1.default;
const Device_1 = require("./Device");
exports.Device = Device_1.default;
const DeviceProtocol_1 = require("./DeviceProtocol");
exports.DeviceProtocol = DeviceProtocol_1.default;
Object.defineProperty(exports, "INTERFACE", { enumerable: true, get: function () { return DeviceProtocol_1.INTERFACE; } });
const Simulator_1 = require("./simulator/Simulator");
const DaumPremiumProtocol_1 = require("./daum/premium/DaumPremiumProtocol");
const DaumClassicProtocol_1 = require("./daum/classic/DaumClassicProtocol");
const AntScanner_1 = require("./ant/AntScanner");
Object.defineProperty(exports, "AntScanner", { enumerable: true, get: function () { return AntScanner_1.AntScanner; } });
const Protocols = {
    SimulatorProtocol: Simulator_1.default,
    DaumClassicProtocol: DaumClassicProtocol_1.default,
    DaumPremiumProtocol: DaumPremiumProtocol_1.default
};
exports.Protocols = Protocols;
