import ICyclingMode, { UpdateRequest} from "./types.js";
import PowerMeterCyclingMode from "./power-meter.js";


export default class DaumPowerMeterCyclingMode extends PowerMeterCyclingMode implements ICyclingMode {

    
    getBikeInitRequest(): UpdateRequest {
        return {slope:0}    
    }    


}