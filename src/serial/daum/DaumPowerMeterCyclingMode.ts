import CyclingMode, { UpdateRequest} from "../../modes/cycling-mode";
import PowerMeterCyclingMode from "../../modes/power-meter";


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