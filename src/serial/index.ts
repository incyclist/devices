import SerialPortProvider,{useSerialPortProvider} from './serialport';
import SerialInterface  from './serial-interface';
import SerialAdapterFactory from './adapter-factory';
export { TCPBinding } from './bindings/tcp';
import { SerialIncyclistDevice,SerialDeviceSettings } from './adapter'

import DaumClassicAdapter from './daum/classic/adapter'
import DaumPremiumAdapter from './daum/premium/adapter';
import KettlerRacerAdapter  from './kettler/ergo-racer/adapter';

SerialAdapterFactory.getInstance().registerAdapter( 'Daum Classic',DaumClassicAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Daum Premium',DaumPremiumAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Kettler Racer', KettlerRacerAdapter)


export {
    SerialPortProvider,useSerialPortProvider, SerialInterface,SerialDeviceSettings,
    SerialAdapterFactory,DaumClassicAdapter,DaumPremiumAdapter,KettlerRacerAdapter,SerialIncyclistDevice
}