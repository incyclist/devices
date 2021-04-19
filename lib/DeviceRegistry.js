"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let _protocols = [];
class DeviceRegistry {
    static _reset() {
        _protocols = [];
    }
    static _get() {
        return _protocols;
    }
    static register(protocol) {
        if (!protocol)
            return;
        const idx = _protocols.findIndex(d => d.getName() === protocol.getName());
        if (idx !== -1) {
            _protocols[idx] = protocol;
        }
        else {
            _protocols.push(protocol);
        }
    }
    static findByName(name) {
        if (!name)
            return;
        return _protocols.find(d => d.getName() === name);
    }
    static findByInterface(interf) {
        if (!interf)
            return;
        return _protocols.filter(d => d.getInterfaces().findIndex(i => i === interf) !== -1);
    }
}
exports.default = DeviceRegistry;
