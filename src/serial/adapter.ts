import { DeviceProperties, DeviceSettings } from "../types/device";
import  { ControllableDevice} from "../base/adpater";
import SerialInterface from "./serial-interface";

export interface SerialDeviceSettings extends DeviceSettings {
    protocol: string,
    host?:string,
    port?:string,
    interface: string | SerialInterface,
}

export class SerialIncyclistDevice extends ControllableDevice  {

    async check(): Promise<boolean> { throw new Error('not implemnted')};
    
    constructor ( settings:SerialDeviceSettings,props?: DeviceProperties) { 
        super(settings,props)
    }

    isEqual( settings: SerialDeviceSettings) {
        if (settings.interface!==this.getInterface())
            return false;

        const s = this.settings as SerialDeviceSettings
        if (settings.protocol!==s.protocol)
            return false;
        if (settings.port!==s.port)
            return false;

        if (settings.host && (!s.host || s.host!==settings.host))
            return false;
        return true;

    }

    getPort(): string {
        const settings: SerialDeviceSettings = this.settings as SerialDeviceSettings
        return settings.port
    }

    getInterface():string {
        return 'serial'
    }


}

