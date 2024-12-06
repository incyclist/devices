"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CyclingPowerWahooCharacteristicExtension = void 0;
const base_1 = require("../base");
const RequestUnlock = 0x20;
const SetTargetPower = 0x42;
class CyclingPowerWahooCharacteristicExtension extends base_1.Characteristic {
    constructor() {
        super({
            uuid: 'A026E005-0A7D-4AB3-97FA-F1500F9FEB8B',
            value: null,
            properties: ['write'],
            descriptors: [
                {
                    uuid: '2901',
                    value: 'Cycling Power Wahoo Extension'
                }
            ]
        });
        this.description = 'Cycling Power Wahoo Extension';
    }
    update(value) {
        const buffer = Buffer.alloc(3);
        buffer.writeUInt8(0x01);
        buffer.writeInt16LE(value.targetPower, 1);
        this.value = buffer;
    }
    write(data, offset, withoutResponse, callback) {
        const code = data.readUInt8(0);
        switch (code) {
            case RequestUnlock:
                break;
            case SetTargetPower:
                this.update({ targetPower: data.readInt16LE(1) });
                break;
            default:
                break;
        }
        callback(true);
    }
}
exports.CyclingPowerWahooCharacteristicExtension = CyclingPowerWahooCharacteristicExtension;
//# sourceMappingURL=cycling-power-wahoo-extension-characteristic.js.map