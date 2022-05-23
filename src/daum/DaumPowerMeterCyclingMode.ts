import CyclingMode, { UpdateRequest} from "../CyclingMode";
import PowerMeterCyclingMode from "../modes/power-meter";


export default class DaumPowerMeterCyclingMode extends PowerMeterCyclingMode implements CyclingMode {

    prevRequest: UpdateRequest;
    hasBikeUpdate: boolean = false;
    
    getBikeInitRequest(): UpdateRequest {
        return {slope:0}    
    }    

    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        super.sendBikeUpdate(request);
        this.prevRequest = {}
        return {}
    }

}