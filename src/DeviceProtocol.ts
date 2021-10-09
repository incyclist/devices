/* istanbul ignore file */

export const INTERFACE = {
    SERIAL: 'serial',
    ANT: 'ant',
    BLE: 'ble',
    BLUETOOTH: 'bluetooth',
    TCPIP: 'tcpip',
    SIMULATOR: 'simulator'
}

export type Device = {
    getID(): string
    getName(): string
    getPort(): string
    getProtocol(): DeviceProtocol
    getProtocolName(): string    
}

export interface DeviceSettings  {
    name: string
    port: string
}

export type DeviceFoundCallback = (device:Device, protocol: DeviceProtocolBase) => void
export type ScanFinishedCallback = (id: number) => void

export type ScanProps = {
    id:number,
    onDeviceFound?: DeviceFoundCallback,
    onScanFinished?: ScanFinishedCallback
}

export interface DeviceProtocol {

    add(props:DeviceSettings) 
    getName(): string
    getInterfaces(): Array<string>
    isBike(): boolean
    isHrm(): boolean
    isPower(): boolean

    scan( props: ScanProps ): void
    stopScan():void    
    isScanning(): boolean

    getDevices(): Array<any>
    setAnt(antClass): void
    getAnt(): any

    setSerialPort(serialClass):void
    getSerialPort(): any
    setNetImpl(netClass): void
    getNetImpl(): any
}

/*
 * As we want to use these classes from with React (and potentially ReactNative), we can't simply import these classes
 * via import statements:
 * - _net: 'net' is a NodeJS Module which is not supported in React, 
 * - _ant: 'gd-ant-plus' requires the 'usb' module, which would not work in a browser
 * - _serial: 'serialport'  would not work in a browser
 * 
 * Therefore in incyclist, we import these classes in the Electron App and expose them to the renderer process,  
 * using setAnt(), setSerialPort() and setNetImpl()
 * 
 * For React Native, we would have to develop netive classes that are exposing the same APIs and they could be used in the app
 * 
 * For native NodeJs/Typescript apps, you just need to import the base modules before using any class of this module
 * 
*/
let _ant, _serial, _net;


export default class DeviceProtocolBase {

    devices: Array<Device>
    
    constructor () {
        this.devices = [];
    }

    getName():string { throw new Error('not implemented') }
    getInterfaces():Array<string> { throw new Error('not implemented') }
    isBike():boolean { throw new Error('not implemented') }
    isHrm():boolean { throw new Error('not implemented') }
    isPower():boolean { throw new Error('not implemented') }

    scan( props: ScanProps ):void { throw new Error('not implemented') }
    stopScan():void { throw new Error('not implemented') }
    isScanning(): boolean { throw new Error('not implemented') } 

    getDevices():Array<Device> { return this.devices}

    setAnt(antClass) { DeviceProtocolBase.setAnt(antClass)}
    getAnt() { return DeviceProtocolBase.getAnt()}
    setSerialPort(serialClass)  { DeviceProtocolBase.setSerialPort(serialClass)}
    getSerialPort() {DeviceProtocolBase.getSerialPort()}
    setNetImpl(netClass) { DeviceProtocolBase.setNetImpl(netClass)}
    getNetImpl() {return DeviceProtocolBase.getNetImpl()}

    static setAnt(antClass) { _ant = antClass}
    static getAnt() {return _ant}
    static setSerialPort(serialClass) { _serial = serialClass}
    static getSerialPort() {return _serial}
    static setNetImpl(netClass) { _net = netClass}
    static getNetImpl() {return _net}
}