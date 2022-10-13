import FtmsCyclingMode from "../../ble/ble-st-mode";
import { DeviceAdapter } from "../../device";

export default class AntStCyclingMode extends FtmsCyclingMode {

    constructor(adapter: DeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntSimMode')
    }

}