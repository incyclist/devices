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

import {MockBinding} from './ble/bindings/index.js'
import {HrMock as BleHrMock} from './ble/hr/mock.js'
import {DaumClassicMock,DaumClassicSimulator, DaumClassicMockImpl} from './serial/daum/classic/mock.js'
import {Daum8iMock as DaumPremiumMock,Daum8iMockImpl as DaumPremiumMockImpl,Daum8MockSimulator as DaumPremiumMockSimulator} from './serial/daum/premium/mock.js'


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

    MockBinding,
    BleHrMock,
    DaumClassicMock,DaumClassicSimulator, DaumClassicMockImpl,
    DaumPremiumMock,DaumPremiumMockImpl,DaumPremiumMockSimulator

}
