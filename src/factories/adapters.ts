import { AntDeviceSettings } from "../antv2/types.js";
import AntAdapterFactory from "../antv2/factories/adapter-factory.js";
import { IncyclistDeviceAdapter } from "../base/adpater.js";
import { BleAdapterFactory } from "../ble/index.js";
import { BleDeviceSettings } from "../ble/types.js";
import { SerialAdapterFactory } from "../serial/index.js";
import { SerialDeviceSettings } from "../serial/types.js";
import { Simulator } from "../simulator/Simulator.js";
import { DeviceProperties, DeviceSettings, INTERFACE } from "../types/device.js";

export default class AdapterFactory {
    protected static adapters: IncyclistDeviceAdapter[] = []

    // @internal only required for testing
    
    static reset():void {
        AdapterFactory.adapters = []
        //SerialAdapterFactory.getInstance().adapters =[]
        //AntAdapterFactory.getInstance().adapters =[]        
        BleAdapterFactory.getInstance('ble').instances =[]
        BleAdapterFactory.getInstance('wifi').instances =[]
    }

    static create( settings:DeviceSettings, props?:DeviceProperties) {
        const adapters = AdapterFactory.adapters

        // special case Simulator (no interface specified)
        if (!settings.interface && (settings as any).protocol==='Simulator') {
            const adapter = new Simulator(settings);
            if (adapter) {
                adapters.push(adapter)
            }
            return adapter
            
        }

        const existing = adapters.find( a => a.isEqual(settings))
        if (existing)
            return existing

        const ifaceName = typeof settings.interface ==='string' ? settings.interface : settings.interface.getName()

        let adapter;
        switch (ifaceName) {
            case INTERFACE.SERIAL:
            case INTERFACE.TCPIP:
                adapter = SerialAdapterFactory.getInstance().createInstance(settings as SerialDeviceSettings,props)
                break;
            case INTERFACE.ANT:
                adapter = AntAdapterFactory.getInstance().createInstance(settings as AntDeviceSettings,props)
                break;
            case INTERFACE.BLE:
                adapter = BleAdapterFactory.getInstance('ble').createInstance(settings as BleDeviceSettings,props)
                break;
            case INTERFACE.DC:
                adapter = BleAdapterFactory.getInstance('wifi').createInstance(settings as BleDeviceSettings,props)
                break;
            case INTERFACE.SIMULATOR:
                adapter = new Simulator(settings,props)
                break;
        }

        if (adapter) {
            adapters.push(adapter)
        }

        return adapter

    }


}