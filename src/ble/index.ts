/* istanbul ignore file */
import BleInterface from './ble-interface'

import BleAdapterFactory from './adapter-factory'
import {BleHrmAdapter, BleHrmComms} from './hr'
import {BlePwrAdapter, BlePwrComms} from './cp'
import {BleFmAdapter,BleFmComms} from './fm'
import {BleWahooAdapter,BleWahooComms} from './wahoo'
import { BleTacxAdapter, BleTacxComms } from './tacx'
import { BleDeviceSettings, BleInterfaceProps } from './types'


const af = BleAdapterFactory.getInstance()
af.register('hr', BleHrmAdapter, BleHrmComms)
af.register('cp', BlePwrAdapter, BlePwrComms)
af.register('fm',BleFmAdapter, BleFmComms)
af.register('wahoo',BleWahooAdapter,BleWahooComms)
af.register('tacx',BleTacxAdapter,BleTacxComms)


export {
    BleAdapterFactory,
    BleInterface,BleInterfaceProps,
    BleDeviceSettings,

    BleHrmAdapter,
    BlePwrAdapter,
    BleFmAdapter,
    BleWahooAdapter,
    BleTacxAdapter
}