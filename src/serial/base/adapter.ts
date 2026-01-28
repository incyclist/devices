import IncyclistDevice from "../../base/adpater.js";
import { DeviceProperties } from "../../types/index.js";
import SerialInterface from "./serial-interface.js";
import { SerialDeviceSettings } from "../types.js";

const DEFAULT_PULL_FREQUENCY = 1000;

export class SerialIncyclistDevice<P extends DeviceProperties> extends IncyclistDevice<P>  {

    pullFrequency: number;

    async check(): Promise<boolean> { throw new Error('not implemnted')};
    
    constructor ( settings:SerialDeviceSettings,props?: P) { 
        super(settings,props)
        this.pullFrequency = DEFAULT_PULL_FREQUENCY
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
    getUniqueName(): string {
        return `${this.getName()} (${this.getPort()})`
    } 
    
    getSerialInterface():SerialInterface {
        throw new Error('not implemented')
    }

    getInterface():string {
        return 'serial'
    }

    setMaxUpdateFrequency(ms:number) {
        if (ms<=this.pullFrequency)
            this.updateFrequency = -1
        else    
            this.updateFrequency = ms;
    }

    setPullFrequency(ms:number) {
        this.pullFrequency = ms;
        if (this.updateFrequency<=this.pullFrequency)
            this.updateFrequency = -1;
    }

    getPullFrequency():number {
        return this.pullFrequency
    }


}

