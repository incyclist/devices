import { DeviceProperties } from "../../../types/device";
import { Route } from "../../../types/route";

export type OnDeviceStartCallback = ( completed:number,total:number  ) => void;

export type DaumPremiumAdapterProps = {
    path: string;
    ifaceName: string
}

export interface Daum8iDeviceProperties extends DeviceProperties {
    route?: Route,
    gear?:number,
    onStatusUpdate?:OnDeviceStartCallback,
}
