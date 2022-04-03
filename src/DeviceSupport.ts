/* istanbul ignore file */

/* eslint-disable no-unused-vars */
import DeviceRegistry from './DeviceRegistry'
import DeviceAdapter from './Device'
import DeviceProtocolBase,{INTERFACE,DeviceProtocol} from './DeviceProtocol'

// import all supported device protocols, as they will auto-register in the DeviceRegistry
import SimulatorProtocol from './simulator/Simulator'
import DaumPremiumProtocol from './daum/premium/DaumPremiumProtocol'
import DaumClassicProtocol from './daum/classic/DaumClassicProtocol'
import { KettlerRacerProtocol } from './kettler/ergo-racer/protocol'
import {AntScanner} from './ant/AntScanner'
import { CyclingModeProperyType } from './CyclingMode'

const Protocols = {
    SimulatorProtocol,
    DaumClassicProtocol,
    DaumPremiumProtocol,
    KettlerRacerProtocol,
}

export {
    DeviceProtocolBase,
    DeviceProtocol,
    DeviceRegistry,
    INTERFACE,
    DeviceAdapter as Device,
    Protocols,
    AntScanner,
    CyclingModeProperyType
}
