"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERFACE = {
    SERIAL: 'serial',
    ANT: 'ant',
    BLE: 'ble',
    BLUETOOTH: 'bluetooth',
    TCPIP: 'tcpip',
    SIMULATOR: 'simulator'
};
let _ant, _serial, _net;
class DeviceProtocolBase {
    constructor() {
        this.devices = [];
    }
    getName() { throw new Error('not implemented'); }
    getInterfaces() { throw new Error('not implemented'); }
    isBike() { throw new Error('not implemented'); }
    isHrm() { throw new Error('not implemented'); }
    isPower() { throw new Error('not implemented'); }
    scan(props) { throw new Error('not implemented'); }
    stopScan() { throw new Error('not implemented'); }
    isScanning() { throw new Error('not implemented'); }
    getDevices() { return this.devices; }
    setAnt(antClass) { DeviceProtocolBase.setAnt(antClass); }
    getAnt() { return DeviceProtocolBase.getAnt(); }
    setSerialPort(serialClass) { DeviceProtocolBase.setSerialPort(serialClass); }
    getSerialPort() { DeviceProtocolBase.getSerialPort(); }
    setNetImpl(netClass) { DeviceProtocolBase.setNetImpl(netClass); }
    getNetImpl() { return DeviceProtocolBase.getNetImpl(); }
    static setAnt(antClass) { _ant = antClass; }
    static getAnt() { return _ant; }
    static setSerialPort(serialClass) { _serial = serialClass; }
    static getSerialPort() { return _serial; }
    static setNetImpl(netClass) { _net = netClass; }
    static getNetImpl() { return _net; }
}
exports.default = DeviceProtocolBase;
