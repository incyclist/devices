// Main Code is from FortiusANT project and modified to suit Zwack
// https://github.com/WouterJD/FortiusANT/tree/master/node

import { Characteristic } from "../base";
import { TValue } from "../types";

function bit(nr) {
  return (1 << nr);
}

const CadenceSupported = bit(1);
//const HeartRateMeasurementSupported = bit(10);
const PowerMeasurementSupported = bit(14);

const PowerTargetSettingSupported = bit(3);
const IndoorBikeSimulationParametersSupported = bit(13);

const CharacteristicUserDescription = '2901';
const FitnessMachineFeature = '2ACC';

export class FitnessMachineFeatureCharacteristic extends  Characteristic<TValue> {
  constructor() {
    
    super({
      uuid: FitnessMachineFeature,
      value:null,
      properties: ['read'],
      descriptors: [ { uuid: CharacteristicUserDescription, value: 'Fitness Machine Feature'}],
    });

    const flags = Buffer.alloc(8);
    flags.writeUInt32LE(CadenceSupported | PowerMeasurementSupported);
    flags.writeUInt32LE(IndoorBikeSimulationParametersSupported | PowerTargetSettingSupported, 4);

    this.value = flags
  }

}