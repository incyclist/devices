import { CscMeasurementCharacteristic } from '../characteristics/csc-measurement-characteristic.js';
import { CscFeatureCharacteristic } from '../characteristics/csc-feature-characteristic.js';
import { Service } from './service.js';

export class CyclingSpeedCadenceService extends Service {
  public cscMeasurement;
  public cscFeature;

  constructor() {
    const measurement = new CscMeasurementCharacteristic();
    const feature = new CscFeatureCharacteristic();

    super({
      uuid: '1816',
      characteristics: [
        feature,
        measurement
      ]
    });

    this.cscMeasurement = measurement;
    this.cscFeature = feature;
  }
}
