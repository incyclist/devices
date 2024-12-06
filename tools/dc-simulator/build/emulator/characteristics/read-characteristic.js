"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticReadCharacteristic = void 0;
const characteristic_js_1 = require("./characteristic.js");
class StaticReadCharacteristic extends characteristic_js_1.Characteristic {
    constructor(uuid, description, value) {
        super({
            uuid: uuid,
            properties: ['read'],
            value: Buffer.isBuffer(value) ? value : Buffer.from(value),
            descriptors: [{ uuid: '2901', value: description }
            ]
        });
        this.description = description;
    }
}
exports.StaticReadCharacteristic = StaticReadCharacteristic;
//# sourceMappingURL=read-characteristic.js.map