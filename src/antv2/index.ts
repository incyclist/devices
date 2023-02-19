/* istanbul ignore file */

import AntPwrAdapter from "./pwr";
import AntFEAdapter from "./fe";
import AntHrAdapter from "./hr";
import AntAdapterFactory from "./adapter-factory";
import AntInterface from "./ant-interface";

import { AntDeviceSettings,AntScanProps } from "./types";

const af = AntAdapterFactory.getInstance()
af.register('PWR', 'Power Meter', AntPwrAdapter)
af.register('HR', 'Heartrate Monitor', AntHrAdapter )
af.register('FE', 'Smart Trainer', AntFEAdapter)


export {
    AntAdapterFactory,AntFEAdapter,AntHrAdapter,AntPwrAdapter,
    AntDeviceSettings,AntScanProps,
    AntInterface
}