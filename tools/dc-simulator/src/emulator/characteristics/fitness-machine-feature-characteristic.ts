// Main Code is from FortiusANT project and modified to suit Zwack
// https://github.com/WouterJD/FortiusANT/tree/master/node

import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";

function bit(nr) {
  return (1 << nr);
}

const CadenceSupported = bit(1);
const HeartRateMeasurementSupported = bit(10);
const PowerMeasurementSupported = bit(14);

const PowerTargetSettingSupported = bit(3);
const IndoorBikeSimulationParametersSupported = bit(13);
const ResistanceTargetSettingSupported = bit(2);

const CharacteristicUserDescription = '2901';
const FitnessMachineFeature = '2ACC';

export interface FtmsFeatures {
  simulation: boolean       // indoor bike simulation parameters (opcode 0x11)
  powerTarget: boolean      // target power (opcode 0x05)
  resistanceTarget: boolean // target resistance (opcode 0x04)
}

export const DEFAULT_FTMS_FEATURES: FtmsFeatures = { simulation: true, powerTarget: true, resistanceTarget: true }

export const resolveFtmsFeatures = (features?: Partial<FtmsFeatures>): FtmsFeatures => ({ ...DEFAULT_FTMS_FEATURES, ...(features ?? {}) })

export class FitnessMachineFeatureCharacteristic extends  Characteristic<TValue> {
  constructor(features?: Partial<FtmsFeatures>) {
    const f = resolveFtmsFeatures(features)

    super({
      uuid: FitnessMachineFeature,
      value:null,
      properties: ['read'],
      descriptors: [ { uuid: CharacteristicUserDescription, value: 'Fitness Machine Feature'}],
    });

    const flags = Buffer.alloc(8);
    flags.writeUInt32LE(CadenceSupported | PowerMeasurementSupported | HeartRateMeasurementSupported, 0);
    const targets = (f.simulation ? IndoorBikeSimulationParametersSupported : 0)
        | (f.powerTarget ? PowerTargetSettingSupported : 0)
        | (f.resistanceTarget ? ResistanceTargetSettingSupported : 0)
    flags.writeUInt32LE(targets, 4);

    this.value = flags
  }

}