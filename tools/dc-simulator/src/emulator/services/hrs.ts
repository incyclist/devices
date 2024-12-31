import { HeartRateMeasurementCharacteristic } from "../characteristics/heart-rate-measurement-characteristic";
import { Service } from "./service";

export class HeartRateService extends Service {
    public heartRateMeasurement
    constructor() {
        const hrmc = new HeartRateMeasurementCharacteristic();
        super({
            uuid: '180D',
            characteristics: [
            hrmc
            ]
        });

        this.heartRateMeasurement = hrmc;
    }

}