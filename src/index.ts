/* istanbul ignore file */
/* eslint-disable no-unused-vars */
import {INTERFACE} from './types/device'
import InterfaceFactory from './interfaces'
import AdapterFactory from './adapters'
import { IncyclistInterface } from './types/interface'
import { IncyclistDeviceAdapter } from './types/adapter'
import { IncyclistCapability } from './types/capabilities'
import { DeviceData } from './types/data'
import  {DeviceSettings} from './types/device'

// import all supported device protocols, as they will auto-register in the DeviceRegistry


// Serial devices support
import {
    SerialPortProvider,useSerialPortProvider,SerialInterface,TCPBinding,
    DaumPremiumAdapter,DaumClassicAdapter,KettlerRacerAdapter,SerialDeviceSettings} 
from './serial'

// Ant+ devices support
import {
    AntAdapterFactory,AntFEAdapter,AntHrAdapter,AntPwrAdapter,
    AntDeviceSettings,AntScanProps, AntInterface, 
} from './antv2'


// BLE devices support
import {
    BleAdapterFactory,
    BleInterface,
    BleDeviceSettings,

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
    DeviceSettings,

    AdapterFactory,

    IncyclistDeviceAdapter,
    DeviceData,
    IncyclistCapability,
    

    AntAdapterFactory,AntFEAdapter,AntHrAdapter,AntPwrAdapter,
    AntDeviceSettings,AntScanProps,AntInterface,

    
    CyclingModeProperyType,

    BleAdapterFactory,
    BleDeviceSettings,
    BleInterface,
    BleHrmAdapter,
    BlePwrAdapter,
    BleFmAdapter,
    BleWahooAdapter,
    BleTacxAdapter,

    SerialPortProvider,
    useSerialPortProvider,
    SerialInterface,
    SerialDeviceSettings,
    TCPBinding,
    DaumClassicAdapter,
    DaumPremiumAdapter,
    KettlerRacerAdapter

    
}
