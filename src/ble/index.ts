import BleInterface from './ble-interface'

import BleAdapterFactory from './adapter-factory'
import {BleHrmAdapter, BleHrmComms} from './hr'
import {BlePwrAdapter, BlePwrComms} from './cp'
import {BleFmAdapter,BleFmComms} from './fm'
import {BleWahooAdapter,BleWahooComms} from './wahoo'
import { BleTacxAdapter, BleTacxComms } from './tacx'


const af = BleAdapterFactory.getInstance()
af.register('hr','Heartrate Monitor', BleHrmAdapter, BleHrmComms)
af.register('cp','Power Meter', BlePwrAdapter, BlePwrComms)
af.register('fm','Smart Trainer',BleFmAdapter, BleFmComms)
af.register('wahoo','Smart Trainer',BleWahooAdapter,BleWahooComms)
af.register('tacx','Smart Trainer',BleTacxAdapter,BleTacxComms)


export {
    BleAdapterFactory,
    BleInterface,

    BleHrmAdapter,
    BlePwrAdapter,
    BleFmAdapter,
    BleWahooAdapter,
    BleTacxAdapter
}