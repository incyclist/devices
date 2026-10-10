import { StaticReadCharacteristic } from '../characteristics/read-characteristic';
import { Service } from "./service";

// Minimal Device Information service (0x180A) - advertised alongside 0x1818 by every real
// Bkool SmartPro/Pro2/Pro3/Go/Go2 sighting in ES. Content is arbitrary; only its presence
// (and that it resolves via GATT discovery) matters for the simulator's purpose.
class DeviceInformationService extends Service {
    constructor() {
        super({
            uuid: '180A',
            characteristics: [
                new StaticReadCharacteristic('2A29', 'Manufacturer Name String', Buffer.from('Bkool')),
                new StaticReadCharacteristic('2A24', 'Model Number String', Buffer.from('SmartPro2')),
            ]
        });
    }
}

export default DeviceInformationService;
