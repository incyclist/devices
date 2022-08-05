import BleERGCyclingMode from "../../ble/ble-erg-mode";
import { UpdateRequest } from "../../CyclingMode";
import { DeviceAdapter } from "../../Device";

export default class AntFeERGCyclingMode extends BleERGCyclingMode {
    
    constructor(adapter: DeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntERGMode')
    }

}