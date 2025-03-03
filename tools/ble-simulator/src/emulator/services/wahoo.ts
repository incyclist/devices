import { StaticReadCharacteristic } from '../characteristics/read-characteristic';
import { Service } from "./service";

// create a dummy implementatoin of an Advanced Wahoo Service
// Incyclist checks for the existance of that service to determine if Wahoo protocol could be enabled
// it does *not* use the service, i.e. the content of the characteristics does not really matter.
// in reality, it will contain a different characteristic

class WahooAdvancdedFtmsService extends Service {
    constructor() {
        
        super({
            uuid: 'a026ee0b-0a7d-4ab3-97fa-f1500f9feb8b',
            characteristics: [
                new StaticReadCharacteristic('2A65', 'Cycling Power Feature', [0x08, 0, 0, 0]), // 0x08 - crank revolutions
                new StaticReadCharacteristic('2A5D', 'Sensor Location', [13])         // 13 = rear hub
            ]
        });
    }

}

export default WahooAdvancdedFtmsService;