/* istanbul ignore file */

import AntPwrAdapter from "./pwr";
import AntFEAdapter from "./fe";
import AntHrAdapter from "./hr";
import AntCadAdapter from "./cad";
import AntAdapterFactory from "./factories/adapter-factory";
import AntInterface from "./base/interface";
import { AntInterfaceProps } from "./types";
import AntSpdAdapter from "./spd";
import AntScAdapter from "./sc";

export { AntDeviceSettings,AntDeviceProperties,AntScanProps } from "./types";

export const initAntFactory = ()=> {
    const af = AntAdapterFactory.getInstance()
    af.register('PWR', 'Power Meter', AntPwrAdapter)
    af.register('HR', 'Heartrate Monitor', AntHrAdapter )
    af.register('FE', 'Smart Trainer', AntFEAdapter)
    af.register('CAD', 'Cadence Sensor', AntCadAdapter)
    af.register('SPD', 'Speed Sensor', AntSpdAdapter)
    af.register('SC', 'Speed + Cadence Sensor', AntScAdapter)    
}

initAntFactory()

export {
    AntAdapterFactory,AntFEAdapter,AntHrAdapter,AntPwrAdapter,AntScAdapter,AntSpdAdapter,AntCadAdapter,
    
    AntInterface,AntInterfaceProps
}