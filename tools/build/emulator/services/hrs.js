"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeartRateService = void 0;
const heart_rate_measurement_characteristic_1 = require("../characteristics/heart-rate-measurement-characteristic");
const base_1 = require("../base");
class HeartRateService extends base_1.Service {
    constructor() {
        const hrmc = new heart_rate_measurement_characteristic_1.HeartRateMeasurementCharacteristic();
        super({
            uuid: '180D',
            characteristics: [
                hrmc
            ]
        });
        this.heartRateMeasurement = hrmc;
    }
}
exports.HeartRateService = HeartRateService;
//# sourceMappingURL=hrs.js.map