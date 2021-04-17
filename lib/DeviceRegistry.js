"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let _devices = [];
class DeviceRegistry {
    static _reset() {
        _devices = [];
    }
    static _get() {
        return _devices;
    }
    static register(device) {
        if (!device)
            return;
        const idx = _devices.findIndex(d => d.getName() === device.getName());
        if (idx !== -1) {
            _devices[idx] = device;
        }
        else {
            _devices.push(device);
        }
    }
    static findByName(name) {
        if (!name)
            return;
        return _devices.find(d => d.getName() === name);
    }
    static findByInterface(interf) {
        if (!interf)
            return;
        return _devices.filter(d => d.getInterfaces().findIndex(i => i === interf) !== -1);
    }
}
exports.default = DeviceRegistry;
