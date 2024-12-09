/* istanbul ignore file */

import BleAdapterFactory from './adapter-factory'
import {BleHrmAdapter, BleHrmComms} from './hr'
import {BlePwrAdapter, BlePwrComms} from './cp'
import {BleFmAdapter,BleFmComms} from './fm'
import {BleWahooAdapter,BleWahooComms} from './wahoo'
import { BleTacxAdapter, BleTacxComms } from './tacx'
import { BleDeviceSettings, BleInterfaceProps } from './types'
import { BleInterface } from '../ble/base/interface'


['ble','wifi'].forEach(  i => { 
    const af = BleAdapterFactory.getInstance(i)
    af.register('hr', BleHrmAdapter, BleHrmComms)
    af.register('cp', BlePwrAdapter, BlePwrComms)
    af.register('fm',BleFmAdapter, BleFmComms)
    af.register('wahoo',BleWahooAdapter,BleWahooComms)
    af.register('tacx',BleTacxAdapter,BleTacxComms)
})

export * from './utils'

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