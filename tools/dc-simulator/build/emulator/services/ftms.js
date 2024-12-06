"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FitnessMachineService = void 0;
const fitness_machine_control_point_characteristic_1 = require("../characteristics/fitness-machine-control-point-characteristic");
const service_1 = require("./service");
const fitness_machine_feature_characteristic_1 = require("../characteristics/fitness-machine-feature-characteristic");
const indoor_bike_data_characteristic_1 = require("../characteristics/indoor-bike-data-characteristic");
const read_characteristic_1 = require("../characteristics/read-characteristic");
class FitnessMachineService extends service_1.Service {
    constructor() {
        const fitnessMachineFeature = new fitness_machine_feature_characteristic_1.FitnessMachineFeatureCharacteristic();
        const IndoorBikeData = new indoor_bike_data_characteristic_1.IndoorBikeDataCharacteristic();
        const fitnessMachineControlPoint = new fitness_machine_control_point_characteristic_1.FitnessMachineControlPointCharacteristic();
        super({
            uuid: '1826',
            characteristics: [
                fitnessMachineFeature,
                IndoorBikeData,
                fitnessMachineControlPoint,
                new read_characteristic_1.StaticReadCharacteristic('2A65', 'Fitness Machine Feature', [0x08, 0, 0, 0]),
            ]
        });
        this.fitnessMachineFeature = fitnessMachineFeature;
        this.indoorBikeData = IndoorBikeData;
        this.fitnessMachineControlPoint = fitnessMachineControlPoint;
    }
}
exports.FitnessMachineService = FitnessMachineService;
//# sourceMappingURL=ftms.js.map