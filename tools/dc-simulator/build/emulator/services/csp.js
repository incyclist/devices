"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const read_characteristic_1 = require("../characteristics/read-characteristic");
const cycling_power_measurement_characteristic_1 = require("../characteristics/cycling-power-measurement-characteristic");
const cycling_power_wahoo_extension_characteristic_1 = require("../characteristics/cycling-power-wahoo-extension-characteristic");
const service_1 = require("./service");
class CyclingPowerService extends service_1.Service {
    constructor() {
        const cyclingPowerMeasurement = new cycling_power_measurement_characteristic_1.CyclingPowerMeasurementCharacteristic();
        const cyclingPowerWahooExtension = new cycling_power_wahoo_extension_characteristic_1.CyclingPowerWahooCharacteristicExtension();
        super({
            uuid: '1818',
            characteristics: [
                cyclingPowerMeasurement,
                cyclingPowerWahooExtension,
                new read_characteristic_1.StaticReadCharacteristic('2A65', 'Cycling Power Feature', [0x08, 0, 0, 0]),
                new read_characteristic_1.StaticReadCharacteristic('2A5D', 'Sensor Location', [13])
            ]
        });
        this.cyclingPowerMeasurement = cyclingPowerMeasurement;
        this.cyclingPowerWahooExtension = cyclingPowerWahooExtension;
    }
}
exports.default = CyclingPowerService;
//# sourceMappingURL=csp.js.map