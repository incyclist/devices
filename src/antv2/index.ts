/* istanbul ignore file */

import AntPwrAdapter from "./pwr";
import AntFEAdapter from "./fe";
import AntHrAdapter from "./hr";
import AntCADAdapter from "./cad";
import AntAdapterFactory from "./factories/adapter-factory";
import AntInterface from "./base/ant-interface";
import { AntInterfaceProps } from "./types";

export { AntDeviceSettings,AntDeviceProperties,AntScanProps } from "./types";

const af = AntAdapterFactory.getInstance()
af.register('PWR', 'Power Meter', AntPwrAdapter)
af.register('HR', 'Heartrate Monitor', AntHrAdapter )
af.register('FE', 'Smart Trainer', AntFEAdapter)
af.register('CAD', 'Cadence Sensor', AntCADAdapter)

export {
    AntAdapterFactory,AntFEAdapter,AntHrAdapter,AntPwrAdapter,
    
    AntInterface,AntInterfaceProps
}