"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndoorBikeDataCharacteristic = void 0;
const base_1 = require("../base");
function bit(nr) {
    return (1 << nr);
}
const InstantaneousCadencePresent = bit(2);
const InstantaneousPowerPresent = bit(6);
const HeartRatePresent = bit(9);
class IndoorBikeDataCharacteristic extends base_1.Characteristic {
    constructor() {
        super({
            uuid: '2AD2',
            value: null,
            properties: ['notify'],
            descriptors: [{ uuid: '2901', value: 'Indoor Bike Data' }]
        });
    }
    update(event) {
        let flags = 0;
        let offset = 0;
        const buffer = Buffer.alloc(30);
        offset += 2;
        offset += 2;
        if ('cadence' in event) {
            flags |= InstantaneousCadencePresent;
            const cadence = event.cadence * 2;
            buffer.writeUInt16LE(cadence, offset);
            offset += 2;
        }
        if ('watts' in event) {
            flags |= InstantaneousPowerPresent;
            const watts = event.watts;
            buffer.writeInt16LE(watts, offset);
            offset += 2;
        }
        if ('heart_rate' in event) {
            flags |= HeartRatePresent;
            const heart_rate = event.heart_rate;
            buffer.writeUInt16LE(heart_rate, offset);
            offset += 2;
        }
        buffer.writeUInt16LE(flags, 0);
        const finalbuffer = buffer.subarray(0, offset);
        this.value = finalbuffer;
        this.data = event;
    }
}
exports.IndoorBikeDataCharacteristic = IndoorBikeDataCharacteristic;
;
//# sourceMappingURL=indoor-bike-data-characteristic.js.map