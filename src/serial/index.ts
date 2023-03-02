/* istanbul ignore file */
import SerialPortProvider,{useSerialPortProvider} from './serialport';
import SerialInterface,{SerialInterfaceProps}  from './serial-interface';
import SerialAdapterFactory from './adapter-factory';
import { SerialIncyclistDevice,SerialDeviceSettings } from './adapter'

import DaumClassicAdapter from './daum/classic/adapter'
import DaumPremiumAdapter from './daum/premium/adapter';
import KettlerRacerAdapter  from './kettler/ergo-racer/adapter';

export { TCPBinding } from './bindings/tcp';

SerialAdapterFactory.getInstance().registerAdapter( 'Daum Classic',DaumClassicAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Daum Premium',DaumPremiumAdapter)
SerialAdapterFactory.getInstance().registerAdapter( 'Kettler Racer', KettlerRacerAdapter)


export {
    SerialPortProvider,useSerialPortProvider, SerialInterface,SerialInterfaceProps,SerialDeviceSettings,
    SerialAdapterFactory,DaumClassicAdapter,DaumPremiumAdapter,KettlerRacerAdapter,SerialIncyclistDevice
}