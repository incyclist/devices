import { FitnessMachineControlPointCharacteristic } from "../characteristics/fitness-machine-control-point-characteristic";
import { Service } from "../base";
import { FitnessMachineFeatureCharacteristic } from "../characteristics/fitness-machine-feature-characteristic";
import { IndoorBikeDataCharacteristic } from "../characteristics/indoor-bike-data-characteristic";
import { StaticReadCharacteristic } from "../characteristics/read-characteristic";

export class FitnessMachineService extends Service {

    public fitnessMachineFeature: FitnessMachineFeatureCharacteristic
    public indoorBikeData: IndoorBikeDataCharacteristic
    public fitnessMachineControlPoint: FitnessMachineControlPointCharacteristic

    
    constructor() {
        const fitnessMachineFeature = new FitnessMachineFeatureCharacteristic()
        const IndoorBikeData = new IndoorBikeDataCharacteristic()
        const fitnessMachineControlPoint = new FitnessMachineControlPointCharacteristic()
        super({
            uuid: '1826',
            characteristics: [
                fitnessMachineFeature,
                IndoorBikeData,
                fitnessMachineControlPoint,
                new StaticReadCharacteristic('2A65', 'Fitness Machine Feature', [0x08, 0, 0, 0]), // 0x08 - crank revolutions
            ]
        });
        
        this.fitnessMachineFeature = fitnessMachineFeature;
        this.indoorBikeData = IndoorBikeData
        this.fitnessMachineControlPoint = fitnessMachineControlPoint
    }

}
