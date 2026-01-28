/* istanbul ignore file */

import AntPwrAdapter from "./pwr/index.js";
import AntFEAdapter from "./fe/index.js";
import AntHrAdapter from "./hr/index.js";
import AntCadAdapter from "./cad/index.js";
import AntAdapterFactory from "./factories/adapter-factory.js";
import AntInterface from "./base/interface.js";
import { AntInterfaceProps } from "./types.js";
import AntSpdAdapter from "./spd/index.js";
import AntScAdapter from "./sc/index.js";

export { AntDeviceSettings,AntDeviceProperties,AntScanProps } from "./types.js";

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