import { AntAdapterFactory, AntDeviceSettings } from "./antv2";
import { SerialAdapterFactory } from "./serial";
import { SerialDeviceSettings } from "./serial/adapter";
import { IncyclistDeviceAdapter } from "./types/adapter";
import { DeviceProperties, DeviceSettings, INTERFACE } from "./types/device";
import { IncyclistInterface } from "./types/interface";

export default class AdapterFactory {
    static adapters: IncyclistDeviceAdapter[] = []

    static create( settings:DeviceSettings, props?:DeviceProperties) {
        const adapters = AdapterFactory.adapters

        const existing = adapters.find( a => a.isEqual(settings))
        if (existing)
            return existing

        const ifaceName = typeof settings.interface ==='string' ? settings.interface : (settings.interface as IncyclistInterface).getName()

        let adapter;
        switch (ifaceName) {
            case INTERFACE.SERIAL:
            case INTERFACE.TCPIP:
                adapter = SerialAdapterFactory.getInstance().createInstance(settings as SerialDeviceSettings,props)
                break;
            case INTERFACE.ANT:
                adapter = AntAdapterFactory.getInstance().createInstance(settings as AntDeviceSettings,props)
                break;
        }
        if (adapter) {
            adapters.push(adapter)
        }

        return adapter

    }


}