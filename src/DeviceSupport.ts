/* istanbul ignore file */

/* eslint-disable no-unused-vars */
import DeviceRegistry from './DeviceRegistry'
import DeviceAdapter from './Device'
import DeviceProtocolBase,{INTERFACE,DeviceProtocol} from './DeviceProtocol'

// import all supported device protocols, as they will auto-register in the DeviceRegistry
import SimulatorProtocol from './simulator/Simulator'
import DaumPremiumProtocol from './daum/premium/DaumPremiumProtocol'
import DaumClassicProtocol from './daum/classic/DaumClassicProtocol'
import KettlerRacerProtocol from './kettler/ergo-racer/protocol'
import {AntScanner} from './ant/AntScanner'
import BleProtocol from './ble/incyclist-protocol'
import { CyclingModeProperyType } from './CyclingMode'

import BleInterface from './ble/ble-interface'
import BleHrmDevice from './ble/hrm'
import BleCyclingPowerDevice from './ble/pwr'

const Protocols = {
    SimulatorProtocol,
    DaumClassicProtocol,
    DaumPremiumProtocol,
    KettlerRacerProtocol,
    BleProtocol
}

export {
    DeviceProtocolBase,
    DeviceProtocol,
    DeviceRegistry,
    INTERFACE,
    DeviceAdapter as Device,
    Protocols,
    
    AntScanner,
    BleProtocol,
    
    CyclingModeProperyType,

    BleInterface,
    BleHrmDevice,
    BleCyclingPowerDevice

    
}
