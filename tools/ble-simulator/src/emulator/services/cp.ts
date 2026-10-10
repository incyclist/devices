import { StaticReadCharacteristic } from '../characteristics/read-characteristic';
import { CyclingPowerMeasurementCharacteristic } from '../characteristics/cycling-power-measurement-characteristic';
import { Service } from "./service";

// Plain standard Cycling Power service (1818) - no vendor-specific characteristics bundled in,
// matching what real Bkool hardware actually exposes (unlike csp.ts, which is Wahoo-specific
// and bundles a proprietary write characteristic inside 1818 for that simulator's purpose).
class CyclingPowerService extends Service {

    public cyclingPowerMeasurement

    constructor() {
        const cyclingPowerMeasurement = new CyclingPowerMeasurementCharacteristic()

        super({
            uuid: '1818',
            characteristics: [
                cyclingPowerMeasurement,
                new StaticReadCharacteristic('2A65', 'Cycling Power Feature', [0x08, 0, 0, 0]), // 0x08 - crank revolutions
                new StaticReadCharacteristic('2A5D', 'Sensor Location', [13])         // 13 = rear hub
            ]
        });

        this.cyclingPowerMeasurement = cyclingPowerMeasurement
    }

}

export default CyclingPowerService;
