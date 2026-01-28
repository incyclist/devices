/* istanbul ignore file */

import {BleHrmAdapter, BleHrmComms} from './hr/index.js'
import {BlePwrAdapter, BlePwrComms} from './cp/index.js'
import {BleFmAdapter,BleFmComms} from './fm/index.js'
import {BleWahooAdapter,BleWahooComms} from './wahoo/index.js'
import { BleTacxAdapter, BleTacxComms } from './tacx/index.js'
import { BleDeviceSettings, BleInterfaceProps } from './types.js'
import { BleInterface, BleInterfaceFactory } from '../ble/base/interface.js'
import { BleMultiTransportInterfaceFactory,BleAdapterFactory } from './factories/index.js'
import { BleCSCAdapter, BleCyclingSpeedCadenceDevice } from './csc/index.js'
import { BleZwiftPlaySensor, ZwiftPlayAdapter } from './zwift/play/index.js'



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

export * from './utils.js'

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