import { BleMultiTransportInterfaceFactory } from '../ble/factories/interface-factory'
import { DirectConnectInterfaceFactory } from './base/interface'

export * from './types'
export * from './consts'
export * from './messages'

BleMultiTransportInterfaceFactory.register('wifi',DirectConnectInterfaceFactory)
