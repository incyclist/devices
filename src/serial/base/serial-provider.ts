
import { InterfaceBinding, InterfaceImplementation } from '../types.js';
import * as _Stream from '@serialport/stream';
const {SerialPortStream} = _Stream

const DEFAULT_BAUD_RATE = 9600

export default class SerialPortProvider {

    static _instance: SerialPortProvider
    interfaces: InterfaceBinding[]
    implemenations: InterfaceImplementation[]


    static getInstance(): SerialPortProvider {
        if (!SerialPortProvider._instance)
            SerialPortProvider._instance = new SerialPortProvider()

        return SerialPortProvider._instance
    }

    constructor() {
        this.interfaces = []
        this.implemenations = []
    }

    setBinding( ifaceName: string,binding: any): void {
        const existing = this.interfaces.find( ib => ib.name===ifaceName)
        if (existing)
            existing.binding = binding
        else
            this.interfaces.push({name:ifaceName,binding})
    }

    getBinding( ifaceName:string ):any {
        const existing = this.interfaces.find( ib => ib.name===ifaceName)
        if (existing)
            return existing.binding
    }

    getSerialPort( ifaceName:string, props:any) {
        const binding = this.getBinding(ifaceName)
        if (binding) {
            props.binding = binding;
            if (props.autoOpen===undefined) props.autoOpen = false;
            if (!props.baudRate) props.baudRate= DEFAULT_BAUD_RATE
            return new SerialPortStream( props)
        }

        const legacy = this.getLegacyInfo(ifaceName)
        if (legacy && legacy.Serialport) {
            const portName = props.path;
            if (props.autoOpen===undefined) props.autoOpen = false;
            const settings = Object.assign({},props)
            delete settings.path;

            return new legacy.Serialport(portName,settings)
        }

    }

    async list( ifaceName:string) {
        const Binding = this.getBinding(ifaceName)
        if (Binding)
            return await Binding.list()

        const legacy = this.getLegacyInfo(ifaceName)
        if (legacy && legacy.Serialport && legacy.Serialport.list) {
            return await legacy.Serialport.list()
        }
        
        return []

    }

    // legacy support

    // In older versions of the Incyclist App, the Serialport class (v8.x) was handed over between main and renderer process of Electron
    // 

    setLegacyClass(ifaceName:string, Serialport:any) {
        const existing = this.getLegacyInfo(ifaceName)
        if (existing)
            existing.Serialport = Serialport;
        else 
            this.implemenations.push( {name:ifaceName, Serialport})

    }

    getLegacyInfo(ifaceName:string) {
        return  this.implemenations.find( ib => ib.name===ifaceName)
    }

    getLegacyClass(ifaceName:string) {
        const existing = this.implemenations.find( ib => ib.name===ifaceName)
        if (existing)
            return existing.Serialport

    }


}

export const useSerialPortProvider = ()=> SerialPortProvider.getInstance()