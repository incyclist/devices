import BleERGCyclingMode from "../../modes/ble-erg-mode";
import { IncyclistDeviceAdapter } from "../../types/adapter";

export default class AntFeERGCyclingMode extends BleERGCyclingMode {
    static isERG = true;

    constructor(adapter: IncyclistDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntERGMode')
    }

}