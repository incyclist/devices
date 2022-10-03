import BleERGCyclingMode from "../../ble/ble-erg-mode";
import { DeviceAdapter } from "../../Device";

export default class AntFeERGCyclingMode extends BleERGCyclingMode {
    static isERG = true;

    constructor(adapter: DeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntERGMode')
    }

}