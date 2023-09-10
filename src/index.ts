/* istanbul ignore file */
/* eslint-disable no-unused-vars */
import {INTERFACE} from './types/device'
import InterfaceFactory from './interfaces'
import AdapterFactory from './adapters'
import { IncyclistInterface,InterfaceProps } from './types/interface'
import { IncyclistDeviceAdapter,Bike as Controllable } from './types/adapter'
import { ControllableDevice as ControllableDeviceAdapter } from './base/adpater'
import { IncyclistCapability } from './types/capabilities'
import { DeviceData } from './types/data'
import  {DeviceSettings} from './types/device'
import  CyclingMode from './modes/cycling-mode'
import calc from './utils/calculations'

export * from './modes/cycling-mode'


export * from './serial'
export * from './ble'
export * from './antv2'

export {
    IncyclistInterface,
    INTERFACE,
    InterfaceFactory,InterfaceProps,
    DeviceSettings,
    CyclingMode,
    AdapterFactory,

    IncyclistDeviceAdapter,Controllable,ControllableDeviceAdapter,
    DeviceData,
    IncyclistCapability,

    calc,

}
