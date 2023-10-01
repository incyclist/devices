import { ControllableDeviceAdapter } from "../..";
import BleERGCyclingMode from "../../modes/ble-erg-mode";

export default class AntFeERGCyclingMode extends BleERGCyclingMode {
    static isERG = true;

    constructor(adapter: ControllableDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntERGMode')
    }

}