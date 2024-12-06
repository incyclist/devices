"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FitnessMachineControlPointCharacteristic = void 0;
const base_1 = require("../base");
const RequestControl = 0x00;
const Reset = 0x01;
const SetTargetPower = 0x05;
const StartOrResume = 0x07;
const StopOrPause = 0x08;
const SetIndoorBikeSimulation = 0x11;
const Success = 0x01;
const OpCodeNotSupported = 0x02;
const ControlNotPermitted = 0x05;
class FitnessMachineControlPointCharacteristic extends base_1.Characteristic {
    constructor() {
        super({
            uuid: '2AD9',
            value: null,
            properties: ['write'],
            descriptors: [{ uuid: '2901', value: 'Fitness Machine Control Point' }]
        });
        this.hasControl = false;
        this.isStarted = false;
        this.targetPower = 0;
    }
    write(data, offset, withoutResponse, callback) {
        const code = data.readUInt8(0);
        const ResponseCode = 0x80;
        let result = Success;
        switch (code) {
            case RequestControl:
                if (this.hasControl) {
                    console.log(this.description, 'Request control', 'Warning: already has control');
                }
                else {
                    this.hasControl = true;
                    console.log(this.description, 'Request control', 'Given control');
                }
                break;
            case Reset:
                if (this.hasControl) {
                    this.hasControl = false;
                    this.isStarted = false;
                    console.log(this.description, 'Reset');
                }
                else {
                    result = ControlNotPermitted;
                    console.log(this.description, 'Reset', 'Error: no control');
                }
                break;
            case SetTargetPower:
                if (this.hasControl) {
                    const targetPower = data.readInt16LE(1);
                    console.log(this.description, 'SetTargetPower', targetPower, 'W');
                }
                else {
                    result = ControlNotPermitted;
                    console.log(this.description, 'SetTargetPower', 'Error: no control');
                }
                break;
            case StartOrResume:
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
                break;
            case StopOrPause:
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
                break;
            case SetIndoorBikeSimulation:
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
                break;
            default:
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