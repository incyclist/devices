import FtmsCyclingMode from "../../ble/ble-st-mode";
import { DeviceAdapter } from "../../Device";

export default class AntStCyclingMode extends FtmsCyclingMode {

    constructor(adapter: DeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntSimMode')
    }

}