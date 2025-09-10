/* istanbul ignore file */

import {BleHrmAdapter, BleHrmComms} from './hr'
import {BlePwrAdapter, BlePwrComms} from './cp'
import {BleFmAdapter,BleFmComms} from './fm'
import {BleWahooAdapter,BleWahooComms} from './wahoo'
import { BleTacxAdapter, BleTacxComms } from './tacx'
import { BleDeviceSettings, BleInterfaceProps } from './types'
import { BleInterface, BleInterfaceFactory } from '../ble/base/interface'
import { BleMultiTransportInterfaceFactory,BleAdapterFactory } from './factories'
import { BleCSCAdapter, BleCyclingSpeedCadenceDevice } from './csc'
import { BleZwiftPlaySensor, ZwiftPlayAdapter } from './zwift/play'



['ble','wifi'].forEach(  i => { 
    const af = BleAdapterFactory.getInstance(i)
    af.register('hr', BleHrmAdapter, BleHrmComms)
    af.register('cp', BlePwrAdapter, BlePwrComms)
    af.register('fm',BleFmAdapter, BleFmComms)
    af.register('wahoo',BleWahooAdapter,BleWahooComms)
    af.register('tacx',BleTacxAdapter,BleTacxComms)
    af.register('csc',BleCSCAdapter,BleCyclingSpeedCadenceDevice)
    af.register('zwift-play',ZwiftPlayAdapter,BleZwiftPlaySensor)
})

BleMultiTransportInterfaceFactory.register('ble',BleInterfaceFactory)

export * from './utils'

export {
    BleAdapterFactory,
    BleMultiTransportInterfaceFactory as BleInterfaceFactory,BleInterface,BleInterfaceProps,
    BleDeviceSettings,

    BleHrmAdapter,
    BlePwrAdapter,
    BleFmAdapter,
    BleWahooAdapter,
    BleTacxAdapter
}