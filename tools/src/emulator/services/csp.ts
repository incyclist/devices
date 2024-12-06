import { StaticReadCharacteristic } from '../characteristics/read-characteristic';
import {CyclingPowerMeasurementCharacteristic} from '../characteristics/cycling-power-measurement-characteristic';
import { CyclingPowerWahooCharacteristicExtension } from '../characteristics/cycling-power-wahoo-extension-characteristic';
import { Service } from '../base';

// https://developer.bluetooth.org/gatt/services/Pages/ServiceViewer.aspx?u=org.bluetooth.service.cycling_power.xml
class CyclingPowerService extends Service {

    public cyclingPowerMeasurement
    public cyclingPowerWahooExtension

    constructor() {
        const cyclingPowerMeasurement = new CyclingPowerMeasurementCharacteristic()
        const cyclingPowerWahooExtension = new CyclingPowerWahooCharacteristicExtension()
        
        super({
            uuid: '1818',
            characteristics: [
                cyclingPowerMeasurement,
                cyclingPowerWahooExtension,
                new StaticReadCharacteristic('2A65', 'Cycling Power Feature', [0x08, 0, 0, 0]), // 0x08 - crank revolutions
                new StaticReadCharacteristic('2A5D', 'Sensor Location', [13])         // 13 = rear hub
            ]
        });

        this.cyclingPowerMeasurement = cyclingPowerMeasurement
        this.cyclingPowerWahooExtension = cyclingPowerWahooExtension
    }

}

export default CyclingPowerService;