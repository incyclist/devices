"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FitnessMachineFeatureCharacteristic = void 0;
const characteristic_js_1 = require("./characteristic.js");
function bit(nr) {
    return (1 << nr);
}
const CadenceSupported = bit(1);
const HeartRateMeasurementSupported = bit(10);
const PowerMeasurementSupported = bit(14);
const PowerTargetSettingSupported = bit(3);
const IndoorBikeSimulationParametersSupported = bit(13);
const CharacteristicUserDescription = '2901';
const FitnessMachineFeature = '2ACC';
class FitnessMachineFeatureCharacteristic extends characteristic_js_1.Characteristic {
    constructor() {
        super({
            uuid: FitnessMachineFeature,
            value: null,
            properties: ['read'],
            descriptors: [{ uuid: CharacteristicUserDescription, value: 'Fitness Machine Feature' }],
        });
        const flags = Buffer.alloc(8);
        flags.writeUInt32LE(CadenceSupported | PowerMeasurementSupported | HeartRateMeasurementSupported, 0);
        flags.writeUInt32LE(IndoorBikeSimulationParametersSupported | PowerTargetSettingSupported, 4);
        this.value = flags;
    }
}
exports.FitnessMachineFeatureCharacteristic = FitnessMachineFeatureCharacteristic;
//# sourceMappingURL=fitness-machine-feature-characteristic.js.map