"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CyclingPowerMeasurementCharacteristic = void 0;
const base_1 = require("../base");
class CyclingPowerMeasurementCharacteristic extends base_1.Characteristic {
    constructor() {
        super({
            uuid: '2A63',
            value: null,
            properties: ['notify'],
            descriptors: [
                { uuid: '2901', value: 'Cycling Power Measurement' },
                { uuid: '2902', value: Buffer.alloc(2) },
                { uuid: '2903', value: Buffer.alloc(2) }
            ]
        });
        this.description = 'Cycling Power Measurement';
    }
    update(event) {
        console.log('update', this.description, event);
        const buffer = Buffer.alloc(14);
        let offset = 0;
        if (('rev_count' in event) && ('wheel_count' in event)) {
            buffer.writeUInt16LE(0x30, offset);
        }
        else if (('rev_count' in event) && !('wheel_count' in event)) {
            buffer.writeUInt16LE(0x20, offset);
        }
        else {
            buffer.writeUInt16LE(0x00, offset);
        }
        if ('watts' in event) {
            const watts = event.watts;
            offset += 2;
            buffer.writeInt16LE(watts, offset);
        }
        if ('wheel_count' in event) {
            offset += 2;
            event.wheel_count = event.wheel_count % 65536;
            buffer.writeUInt32LE(event.wheel_count, offset);
            const wheel_time = (event.wheel_count * event.spd_int) % 65536;
            offset += 4;
            buffer.writeUInt16LE(wheel_time, offset);
        }
        if ('rev_count' in event) {
            offset += 2;
            event.rev_count = event.rev_count % 65536;
            buffer.writeUInt16LE(event.rev_count, offset);
            offset += 2;
            buffer.writeUInt16LE(event.cad_time, offset);
        }
        this.value = buffer;
        this.data = event;
    }
}
exports.CyclingPowerMeasurementCharacteristic = CyclingPowerMeasurementCharacteristic;
//# sourceMappingURL=cycling-power-measurement-characteristic.js.map