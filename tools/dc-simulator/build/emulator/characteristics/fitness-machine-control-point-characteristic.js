"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FitnessMachineControlPointCharacteristic = void 0;
const characteristic_js_1 = require("./characteristic.js");
const RequestControl = 0x00;
const Reset = 0x01;
const SetTargetPower = 0x05;
const StartOrResume = 0x07;
const StopOrPause = 0x08;
const SetIndoorBikeSimulation = 0x11;
const Success = 0x01;
const OpCodeNotSupported = 0x02;
const ControlNotPermitted = 0x05;
class FitnessMachineControlPointCharacteristic extends characteristic_js_1.Characteristic {
    constructor() {
        super({
            uuid: '2AD9',
            value: null,
            properties: ['write'],
            descriptors: [{ uuid: '2901', value: 'Fitness Machine Control Point' }]
        });
        this.handlers = {};
        this.hasControl = false;
        this.isStarted = false;
        this.targetPower = 0;
        this.handlers[RequestControl] = this.handleRequestControl.bind(this);
        this.handlers[Reset] = this.handleReset.bind(this);
        this.handlers[SetTargetPower] = this.handleSetTargetPower.bind(this);
        this.handlers[StartOrResume] = this.handleStartOrResume.bind(this);
        this.handlers[StopOrPause] = this.handleStopOrPause.bind(this);
        this.handlers[SetIndoorBikeSimulation] = this.handleSetIndoorBikeSimulation.bind(this);
    }
    handleRequestControl() {
        if (this.hasControl) {
            console.log(this.description, 'Request control', 'Warning: already has control');
        }
        else {
            this.hasControl = true;
            console.log(this.description, 'Request control', 'Given control');
        }
        return Success;
    }
    handleReset() {
        console.log(this.description, 'Reset');
        this.hasControl = false;
        this.isStarted = false;
        this.targetPower = 0;
        return Success;
    }
    handleSetTargetPower(data) {
        if (this.hasControl) {
            this.targetPower = data.readInt16LE(1);
            console.log(this.description, 'Set target power', this.targetPower);
            return Success;
        }
        else {
            console.log(this.description, 'Set target power', this.targetPower, 'Error: no control');
            return ControlNotPermitted;
        }
    }
    handleStartOrResume() {
        let result = Success;
        if (this.hasControl) {
            if (this.isStarted) {
                console.log(this.description, 'Start or Resume', 'already started/resumed');
            }
            else {
                console.log(this.description, 'Start or Resume');
                this.isStarted = true;
            }
        }
        else {
            result = ControlNotPermitted;
            console.log(this.description, 'Start or Resume', 'Error: no control');
        }
        return result;
    }
    handleStopOrPause() {
        let result = Success;
        if (this.hasControl) {
            if (this.isStarted) {
                console.log(this.description, 'Stop or Pause');
                this.isStarted = false;
            }
            else {
                console.log(this.description, 'Stop or Pause', 'Error: already stopped/paused');
            }
        }
        else {
            result = ControlNotPermitted;
            console.log(this.description, 'Stop or Pause', 'Error: no control');
        }
        return result;
    }
    handleSetIndoorBikeSimulation(data) {
        let result = Success;
        if (this.hasControl) {
            const windSpeed = data.readInt16LE(1) * 0.001;
            const grade = data.readInt16LE(3) * 0.01;
            const crr = data.readUInt8(5) * 0.0001;
            const cw = data.readUInt8(6) * 0.01;
            console.log(this.description, 'SetIndoorBikeSimulation', { windSpeed, grade, crr, cw });
        }
        else {
            result = ControlNotPermitted;
            console.log(this.description, 'SetIndoorBikeSimulation', 'Error: no control');
        }
        return result;
    }
    write(data, offset, withoutResponse, callback) {
        const code = data.readUInt8(0);
        const ResponseCode = 0x80;
        let result;
        const handler = this.handlers[code];
        if (handler) {
            result = handler(data);
        }
        else {
            console.log(this.description, 'Unsupported OPCODE:' + code);
            result = OpCodeNotSupported;
        }
        const buffer = Buffer.alloc(3);
        buffer.writeUInt8(ResponseCode);
        buffer.writeUInt8(code, 1);
        buffer.writeUInt8(result, 2);
        if (withoutResponse)
            callback(true);
        else
            callback(true, buffer);
    }
}
exports.FitnessMachineControlPointCharacteristic = FitnessMachineControlPointCharacteristic;
;
//# sourceMappingURL=fitness-machine-control-point-characteristic.js.map