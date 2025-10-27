/* istanbul ignore file */
/* eslint-disable no-unused-vars */
import {INTERFACE,DeviceSettings,DeviceProperties} from './types/device'
import { IncyclistInterface,InterfaceProps } from './types/interface'
import { IncyclistCapability } from './types/capabilities'
import { IncyclistAdapterData } from './types/data'
import  ICyclingMode from './modes/types'
import calc from './utils/calculations'
import IncyclistDevice,{IncyclistDeviceAdapter} from './base/adpater'
import {IAdapter} from './types/adapter'
import AdapterFactory from './factories/adapters'
import InterfaceFactory from './factories/interfaces'

export * from './modes/types'
export * from './serial'
export * from './ble'
export * from './antv2'
export * from './direct-connect'
export * from './features'

export {
    IAdapter,IncyclistDevice,IncyclistDeviceAdapter,DeviceSettings,DeviceProperties,
    AdapterFactory,InterfaceFactory,
    IncyclistInterface,
    INTERFACE,
    InterfaceProps,
    
    ICyclingMode,
    
    IncyclistAdapterData as DeviceData,
    IncyclistCapability,    
    calc,

}
