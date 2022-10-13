/* istanbul ignore file */

/* eslint-disable no-unused-vars */
import DeviceRegistry from './registry'
import DeviceAdapter from './device'
import DeviceProtocolBase,{INTERFACE,DeviceProtocol} from './protocol'

// import all supported device protocols, as they will auto-register in the DeviceRegistry
import SimulatorProtocol from './simulator/Simulator'
import DaumPremiumProtocol from './daum/premium/DaumPremiumProtocol'
import DaumClassicProtocol from './daum/classic/DaumClassicProtocol'
import KettlerRacerProtocol from './kettler/ergo-racer/protocol'
import {AntScanner} from './ant/AntScanner'
import { CyclingModeProperyType } from './cycling-mode'

import AntProtocol from './antv2/incyclist-protocol'
import AntInterface from './antv2/ant-interface'

import BleProtocol from './ble/incyclist-protocol'
import BleInterface from './ble/ble-interface'
import BleHrmDevice from './ble/hrm'
import BleCyclingPowerDevice from './ble/pwr'
import BleFitnessMachineDevice from './ble/fm'
import WahooAdvancedFitnessMachineDevice from './ble/wahoo-kickr'

const Protocols = {
    SimulatorProtocol,
    DaumClassicProtocol,
    DaumPremiumProtocol,
    KettlerRacerProtocol,
    BleProtocol
}

export interface FeatureList {
    [key: string] : boolean;
} 


export default class DeviceSupport {
    static _features: FeatureList = {}

    static init( props:{ features?:FeatureList }={}):void {
        if (props.features) {
            this._features = props.features;
        }
    }

    static hasFeature(feature: string): boolean {
        const featureVal =  this._features[feature];
        if (featureVal===undefined)
            return false;
        return featureVal
    }

    static setFeature(key:string, value:boolean) {
        this._features[key] = value;
    }
}

export {
    DeviceProtocolBase,
    DeviceProtocol,
    DeviceRegistry,
    INTERFACE,
    DeviceAdapter as Device,
    Protocols,
    
    AntScanner,

    AntProtocol,
    AntInterface,

    
    CyclingModeProperyType,

    BleProtocol,
    BleInterface,
    BleHrmDevice,
    BleCyclingPowerDevice,
    BleFitnessMachineDevice,
    WahooAdvancedFitnessMachineDevice

    
}
