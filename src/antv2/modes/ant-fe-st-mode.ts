import FtmsCyclingMode from "../../modes/ble-st-mode";
import { IncyclistDeviceAdapter } from "../../types/adapter";

export default class AntStCyclingMode extends FtmsCyclingMode {

    constructor(adapter: IncyclistDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntSimMode')
    }

}