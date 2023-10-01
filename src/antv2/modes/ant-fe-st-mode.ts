import { ControllableDeviceAdapter } from "../..";
import FtmsCyclingMode from "../../modes/ble-st-mode";

export default class AntStCyclingMode extends FtmsCyclingMode {

    constructor(adapter: ControllableDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('AntSimMode')
    }

}