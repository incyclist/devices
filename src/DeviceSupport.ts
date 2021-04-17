/* istanbul ignore file */

/* eslint-disable no-unused-vars */
import DeviceRegistry from './DeviceRegistry'
import Device from './Device'
import DeviceProtocol,{INTERFACE} from './DeviceProtocol'

// import all supported device protocols, as they will auto-register in the DeviceRegistry
import SimulatorProtocol from './simulator/Simulator'
import DaumPremiumProtocol from './daum/premium/DaumPremiumProtocol'
import DaumClassicProtocol from './daum/classic/DaumClassicProtocol'
import {AntScanner} from './ant/AntScanner'

const Protocols = {
    SimulatorProtocol,
    DaumClassicProtocol,
    DaumPremiumProtocol
}

export {
    DeviceProtocol,
    DeviceRegistry,
    INTERFACE,
    Device,
    Protocols,
    AntScanner,
}
