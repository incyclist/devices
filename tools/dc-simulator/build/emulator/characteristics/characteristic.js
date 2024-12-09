"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Characteristic = void 0;
const stream_1 = require("stream");
class Characteristic {
    constructor(props) {
        this.emitter = new stream_1.EventEmitter();
        this.uuid = props.uuid;
        this.properties = props.properties;
        this.value = props.value;
        this.descriptors = props.descriptors;
    }
    subscribe(callback) {
        this.emitter.on('notification', callback);
        console.log('subscribe', this.description, this.emitter.listenerCount('notification'), callback);
    }
    unsubscribe(callback) {
        this.emitter.off('notification', callback);
        console.log('unsubscribe', this.description, this.emitter.listenerCount('notification'), callback);
    }
    update(value) {
        this.data = value;
    }
    notify() {
        if (!this.value) {
            return;
        }
        this.emitter.emit('notification', this.value);
        if (process.env.NOTIFY_DEBUG)
            console.log(`${this.description} ${this.valueStr()} Msg:${this.value.toString('hex')}`);
    }
    valueStr() {
        if (!this.data)
            return '';
        const keys = Object.keys(this.data).filter(k => this.data[k] !== undefined && this.data[k] !== null);
        const values = Object.values(this.data);
        return keys.map((key, i) => `${key}:${values[i]}`).join(',');
    }
    write(data, offset, withoutResponse, callback) {
        throw new Error('Method not implemented.');
    }
}
exports.Characteristic = Characteristic;
//# sourceMappingURL=characteristic.js.map