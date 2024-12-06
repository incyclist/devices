"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Service = void 0;
class Service {
    constructor(props) {
        this.characteristics = [];
        this.uuid = props.uuid;
        this.characteristics = props.characteristics;
    }
    notify() {
        this.characteristics.forEach(c => c.notify());
    }
    start(frequency) {
        this.iv = setInterval(() => {
            this.notify();
        }, frequency);
    }
    stop() {
        if (this.iv) {
            clearInterval(this.iv);
            delete this.iv;
        }
    }
}
exports.Service = Service;
//# sourceMappingURL=service.js.map