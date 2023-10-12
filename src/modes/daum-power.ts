import ICyclingMode, { UpdateRequest} from "./types";
import PowerMeterCyclingMode from "./power-meter";


export default class DaumPowerMeterCyclingMode extends PowerMeterCyclingMode implements ICyclingMode {

    
    getBikeInitRequest(): UpdateRequest {
        return {slope:0}    
    }    


}