import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";


function bit(nr) {
  return (1 << nr);
}

const InstantaneousCadencePresent = bit(2);
const InstantaneousPowerPresent = bit(6);
const InstantaneousResistancePresent = bit(5);
const HeartRatePresent = bit(9);

interface IndoorBikeData extends TValue {
    watts: number,
    cadence: number
    heart_rate: number
    resistance?: number
}

export class IndoorBikeDataCharacteristic extends  Characteristic<IndoorBikeData> {
    constructor() {
        super({
            uuid: '2AD2',
            value: null,
            properties: ['notify'],
            descriptors: [{ uuid: '2901', value: 'Indoor Bike Data'}]
        });
    }


  update(event:IndoorBikeData) {
    

    let flags = 0;
    let offset = 0;
    const buffer = Buffer.alloc(30);

    offset += 2;

    // Instantaneous speed, always 0 ATM
    buffer.writeUInt16LE(0, offset);
    offset += 2;

    if ('cadence' in event) {
      flags |= InstantaneousCadencePresent;
      // cadence is in 0.5rpm resolution but is supplied in 1rpm resolution, multiply by 2 for ble.
      const cadence = event.cadence * 2
      buffer.writeUInt16LE(cadence, offset);
      offset += 2;
    }

    if ('resistance' in event) {
      flags |= InstantaneousResistancePresent;
      const resistance = event.resistance;
      buffer.writeUInt16LE(resistance, offset);
      offset += 2;
    }

    if ('watts' in event) {
      flags |= InstantaneousPowerPresent;
      const watts = event.watts;
      buffer.writeInt16LE(watts, offset);
      offset += 2;
    }

    
    if ('heart_rate' in event) {
      flags |= HeartRatePresent;
      const heart_rate = event.heart_rate;
      buffer.writeUInt16LE(heart_rate, offset);
      offset += 2;
    }

    buffer.writeUInt16LE(flags,0);
    
    const finalbuffer = buffer.subarray(0, offset);

    this.value = finalbuffer
    this.data = event

  }
};

