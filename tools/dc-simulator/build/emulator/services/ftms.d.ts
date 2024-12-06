import { FitnessMachineControlPointCharacteristic } from "../characteristics/fitness-machine-control-point-characteristic";
import { Service } from "./service";
import { FitnessMachineFeatureCharacteristic } from "../characteristics/fitness-machine-feature-characteristic";
import { IndoorBikeDataCharacteristic } from "../characteristics/indoor-bike-data-characteristic";
export declare class FitnessMachineService extends Service {
    fitnessMachineFeature: FitnessMachineFeatureCharacteristic;
    indoorBikeData: IndoorBikeDataCharacteristic;
    fitnessMachineControlPoint: FitnessMachineControlPointCharacteristic;
    constructor();
}
