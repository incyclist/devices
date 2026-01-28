import { ZwiftPlayControlPointCharacteristic } from "../characteristics/zwift-play-control-point.js"
import { Service } from "./service.js"
import { ZwiftPlayMeasurementCharacteristic } from "../characteristics/zwift-play-measurement.js"
import { ZwiftPlayResponseCharacteristic } from "../characteristics/zwift-play-response.js"

export class ZwiftPlayService extends Service {

    public controlPoint: ZwiftPlayControlPointCharacteristic
    public measurement: ZwiftPlayMeasurementCharacteristic
    public response: ZwiftPlayResponseCharacteristic

    
    constructor() {
        const controlPoint =  new ZwiftPlayControlPointCharacteristic()
        const measurement = new ZwiftPlayMeasurementCharacteristic()
        const response = new ZwiftPlayResponseCharacteristic()

        super({
            uuid: '00000001-19ca-4651-86e5-fa29dcdd09d1',
            characteristics: [
                controlPoint, measurement, response
            ]
        });

        this.controlPoint = controlPoint
        this.measurement = measurement
        this.response = response
        
    }

}
