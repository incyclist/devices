/* istanbul ignore file */
import SerialPortProvider,{useSerialPortProvider} from './base/serial-provider.js';
import SerialInterface  from './base/serial-interface.js';
import SerialAdapterFactory from './factories/adapter-factory.js';


import DaumClassicAdapter from './daum/classic/adapter.js'
import DaumPremiumAdapter from './daum/premium/adapter.js';
import KettlerRacerAdapter  from './kettler/ergo-racer/adapter.js';

export {SerialIncyclistDevice} from './base/adapter.js'
export { SerialInterfaceProps,SerialDeviceSettings,SerialScannerProps } from "./types.js";
export { TCPBinding } from './bindings/tcp.js';
export {DaumPremiumDeviceProperties,Route,Point} from './daum/premium/types.js'
export {DaumClassicProperties} from './daum/classic/types.js'

SerialAdapterFactory.getInstance().registerAdapter( 'Daum Classic',DaumClassicAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Daum Premium',DaumPremiumAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Kettler Racer', KettlerRacerAdapter)


export {
    // Adapters
    SerialAdapterFactory,DaumClassicAdapter, DaumPremiumAdapter,KettlerRacerAdapter,

    SerialPortProvider,useSerialPortProvider, 
    SerialInterface
}