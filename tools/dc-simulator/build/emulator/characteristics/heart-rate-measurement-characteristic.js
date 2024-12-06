"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeartRateMeasurementCharacteristic = void 0;
const characteristic_js_1 = require("./characteristic.js");
const HeartRateValueFormatUint8 = 0;
class HeartRateMeasurementCharacteristic extends characteristic_js_1.Characteristic {
    constructor() {
        super({
            uuid: '2A37',
            value: null,
            properties: ['notify'],
            descriptors: [{ uuid: '2901', value: 'Heart Rate Measurement' }]
        });
    }
    update(event) {
        const buffer = Buffer.alloc(2);
        if ('heart_rate' in event) {
            buffer.writeUInt8(HeartRateValueFormatUint8, 0);
            buffer.writeUInt8(event.heart_rate, 1);
        }
        this.value = buffer;
        this.data = event;
    }
}
exports.HeartRateMeasurementCharacteristic = HeartRateMeasurementCharacteristic;
;
//# sourceMappingURL=heart-rate-measurement-characteristic.js.map