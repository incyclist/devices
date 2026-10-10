import { BkoolControlCharacteristic } from '../characteristics/bkool-control-characteristic';
import { Service } from "./service";

// Proprietary Bkool service observed on real devices (ES telemetry, INC-36 research).
// Real devices expose this alongside the standard Cycling Power service (1818) for
// telemetry - see bkool.ts simulator entrypoint, which sets up both.
class BkoolService extends Service {

    public control: BkoolControlCharacteristic

    constructor() {
        const control = new BkoolControlCharacteristic()

        super({
            uuid: 'F03EEE01-4910-473C-BE46-960948C2F59C',
            characteristics: [control]
        });

        this.control = control
    }
}

export default BkoolService;
