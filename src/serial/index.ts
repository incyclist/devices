/* istanbul ignore file */
import SerialPortProvider,{useSerialPortProvider} from './base/serialport';
import SerialInterface  from './base/serial-interface';
import SerialAdapterFactory from './factories/adapter-factory';


import DaumClassicAdapter from './daum/classic/adapter'
import DaumPremiumAdapter from './daum/premium/adapter';
import KettlerRacerAdapter  from './kettler/ergo-racer/adapter';

export {SerialIncyclistDevice} from './base/adapter'
export { SerialInterfaceProps,SerialDeviceSettings,SerialScannerProps } from "./types";
export { TCPBinding } from './bindings/tcp';
export {DaumPremiumDeviceProperties,Route,Point} from './daum/premium/types'
export {DaumClassicProperties} from './daum/classic/types'

SerialAdapterFactory.getInstance().registerAdapter( 'Daum Classic',DaumClassicAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Daum Premium',DaumPremiumAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Kettler Racer', KettlerRacerAdapter)


export {
    // Adapters
    SerialAdapterFactory,DaumClassicAdapter, DaumPremiumAdapter,KettlerRacerAdapter,

    SerialPortProvider,useSerialPortProvider, 
    SerialInterface
}