import { BleMultiTransportInterfaceFactory } from '../ble/factories/interface-factory.js'
import { DirectConnectInterfaceFactory } from './base/interface.js'

export * from './types.js'
export * from './consts.js'
export * from './messages/index.js'

BleMultiTransportInterfaceFactory.register('wifi',DirectConnectInterfaceFactory)
