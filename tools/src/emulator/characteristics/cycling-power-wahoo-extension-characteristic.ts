import { Characteristic } from "../base";
import { TValue } from "../types";

// https://developer.bluetooth.org/gatt/characteristics/Pages/CharacteristicViewer.aspx?u=org.bluetooth.characteristic.cycling_power_measurement.xml
const RequestUnlock = 0x20;
const SetTargetPower = 0x42;

interface CyclingPowerWahoo extends TValue {
    targetPower: number    
}

export class CyclingPowerWahooCharacteristicExtension extends Characteristic<CyclingPowerWahoo> {

  constructor() {
    super({
      uuid: 'A026E005-0A7D-4AB3-97FA-F1500F9FEB8B',
      value: null,
      properties: ['write'],
      descriptors: [
        {
          uuid: '2901',
          value: 'Cycling Power Wahoo Extension'
        }
      ]
    });
    this.description = 'Cycling Power Wahoo Extension';
  }

  update(value: CyclingPowerWahoo): void {
    const buffer = Buffer.alloc(3);
    buffer.writeUInt8(0x01); // TargetPowerChanged
    buffer.writeInt16LE(value.targetPower, 1);
    this.value = buffer
  }


  write(data: Buffer, offset: number, withoutResponse: boolean, callback: (result: boolean) => void): void {
    const code = data.readUInt8(0);


    switch (code) {
      case RequestUnlock:
        break;

      case SetTargetPower:
        this.update({ targetPower: data.readInt16LE(1) });
        break;

      default:
        break;
    }

    callback(true);

  }
}

