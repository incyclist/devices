/* istanbul ignore file */
/* eslint-disable no-unused-vars */
import {INTERFACE,DeviceSettings,DeviceProperties} from './types/device.js'
import { IncyclistInterface,InterfaceProps } from './types/interface.js'
import { IncyclistCapability } from './types/capabilities.js'
import { IncyclistAdapterData } from './types/data.js'
import  ICyclingMode from './modes/types.js'
import calc from './utils/calculations.js'
import IncyclistDevice,{IncyclistDeviceAdapter} from './base/adpater.js'
import {IAdapter} from './types/adapter.js'
import AdapterFactory from './factories/adapters.js'
import InterfaceFactory from './factories/interfaces.js'

export * from './modes/types.js'
export * from './serial/index.js'
export * from './ble/index.js'
export * from './antv2/index.js'
export * from './direct-connect/index.js'
export * from './features/index.js'
export * from './proto/zwift_hub.js'

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
