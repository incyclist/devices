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

export * from './factories'
export * from './modes/types'
export * from './serial'
export * from './ble'
export * from './antv2'
export * from './direct-connect'

export {
    IAdapter,IncyclistDevice,IncyclistDeviceAdapter,DeviceSettings,DeviceProperties,

    IncyclistInterface,
    INTERFACE,
    InterfaceProps,
    
    ICyclingMode,
    
    IncyclistAdapterData as DeviceData,
    IncyclistCapability,    
    calc,

}
