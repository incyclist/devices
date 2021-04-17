"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERFACE = void 0;
exports.INTERFACE = {
    SERIAL: 'serial',
    ANT: 'ant',
    BLE: 'ble',
    BLUETOOTH: 'bluetooth',
    TCPIP: 'tcpip',
    SIMULATOR: 'simulator'
};
let _ant, _serial, _net;
class DeviceProtocol {
    constructor() {
        this.devices = [];
    }
    getName() { }
    getInterfaces() { }
    isBike() { }
    isHrm() { }
    isPower() { }
    scan(props) { }
    stopScan() { }
    isScanning() { }
    getDevices() { return this.devices; }
    setAnt(antClass) { DeviceProtocol.setAnt(antClass); }
    getAnt() { return DeviceProtocol.getAnt(); }
    setSerialPort(serialClass) { DeviceProtocol.setSerialPort(serialClass); }
    getSerialPort() { DeviceProtocol.getSerialPort(); }
    setNetImpl(netClass) { DeviceProtocol.setNetImpl(netClass); }
    getNetImpl() { return DeviceProtocol.getNetImpl(); }
    static setAnt(antClass) { _ant = antClass; }
    static getAnt() { return _ant; }
    static setSerialPort(serialClass) { _serial = serialClass; }
    static getSerialPort() { return _serial; }
    static setNetImpl(netClass) { _net = netClass; }
    static getNetImpl() { return _net; }
}
exports.default = DeviceProtocol;
