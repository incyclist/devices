/* istanbul ignore file */

/* eslint-disable no-unused-vars */
import DeviceAdapter from './base/adpater'
import {INTERFACE} from './types/device'
import InterfaceFactory from './interfaces'
import AdapterFactory from './adapters'
import { IncyclistInterface } from './types/interface'
import { IncyclistDeviceAdapter } from './types/adapter'
import { IncyclistCapability } from './types/capabilities'
import { DeviceData } from './types/data'

// import all supported device protocols, as they will auto-register in the DeviceRegistry


// Serial devices support
import {
    SerialPortProvider,useSerialPortProvider,SerialInterface,TCPBinding,
    DaumPremiumAdapter,DaumClassicAdapter,KettlerRacerAdapter} 
from './serial'

// Ant+ devices support
import {
    AntAdapterFactory,AntFEAdapter,AntHrAdapter,AntPwrAdapter,
    AntDeviceSettings,AntScanProps, AntInterface
} from './antv2'


// BLE devices support
import {
    BleAdapterFactory,
    BleInterface,

    BleHrmAdapter,
    BlePwrAdapter,
    BleFmAdapter,
    BleWahooAdapter,
    BleTacxAdapter

} from './ble'


import { CyclingModeProperyType } from './modes/cycling-mode'

export {
    IncyclistInterface,
    INTERFACE,
    InterfaceFactory,

    AdapterFactory,

    IncyclistDeviceAdapter,
    DeviceData,
    IncyclistCapability,
    

    AntAdapterFactory,AntFEAdapter,AntHrAdapter,AntPwrAdapter,
    AntDeviceSettings,AntScanProps,AntInterface,

    
    CyclingModeProperyType,

    BleAdapterFactory,
    BleInterface,
    BleHrmAdapter,
    BlePwrAdapter,
    BleFmAdapter,
    BleWahooAdapter,
    BleTacxAdapter,

    SerialPortProvider,
    useSerialPortProvider,
    SerialInterface,
    TCPBinding,
    DaumClassicAdapter,
    DaumPremiumAdapter,
    KettlerRacerAdapter

    
}
