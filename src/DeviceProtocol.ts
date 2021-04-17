/* istanbul ignore file */

export const INTERFACE = {
    SERIAL: 'serial',
    ANT: 'ant',
    BLE: 'ble',
    BLUETOOTH: 'bluetooth',
    TCPIP: 'tcpip',
    SIMULATOR: 'simulator'
}

let _ant, _serial, _net;

type DeviceFoundCallback = (device:any, protocol: DeviceProtocol) => void
type ScanFinishedCallback = (id: number) => void

export type ScanProps = {
    id:number,
    onDeviceFound?: DeviceFoundCallback,
    onScanFinished?: ScanFinishedCallback
}



export default class DeviceProtocol {

    devices: Array<any>
    
    constructor () {
        this.devices = [];
    }

    getName() {}
    getInterfaces() {}
    isBike() {}
    isHrm() {}
    isPower() {}

    scan( props: ScanProps ) {}
    stopScan() {}   
    isScanning() {} 
    getDevices() { return this.devices}
    setAnt(antClass) { DeviceProtocol.setAnt(antClass)}
    getAnt() { return DeviceProtocol.getAnt()}
    setSerialPort(serialClass)  { DeviceProtocol.setSerialPort(serialClass)}
    getSerialPort() {DeviceProtocol.getSerialPort()}
    setNetImpl(netClass) { DeviceProtocol.setNetImpl(netClass)}
    getNetImpl() {return DeviceProtocol.getNetImpl()}

    static setAnt(antClass) { _ant = antClass}
    static getAnt() {return _ant}
    static setSerialPort(serialClass) { _serial = serialClass}
    static getSerialPort() {return _serial}
    static setNetImpl(netClass) { _net = netClass}
    static getNetImpl() {return _net}


}