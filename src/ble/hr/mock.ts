import { BleMockPeripheral } from "../bindings/mock";
import { PrimaryService, StaticReadCharacteristic } from "../bindings/types";

const HR: PrimaryService = {
    uuid: "180d",
    characteristics: [

    ]
}

const DIS: PrimaryService = {
    uuid: '180a',
    characteristics: [
      new StaticReadCharacteristic('2a23', 'System Id', '0'),
      new StaticReadCharacteristic('2a24', 'Model Number', '1'),
      new StaticReadCharacteristic('2a25', 'Serial Number', '4711'),
      new StaticReadCharacteristic('2a26', 'Firmware Revision', '1'),
      new StaticReadCharacteristic('2a27', 'Hardware Revision', '1'),
      new StaticReadCharacteristic('2a28', 'Software Revision', '1'),
      new StaticReadCharacteristic('2a29', 'Manufacturer Name', 'Incyclist')
    ]    
}

export const HrMock: BleMockPeripheral = {
    services: [HR,DIS],
    id: "a87b6100820d48b1401bf83a8cf6f046",
    name: "HRM-Mock",
    address: "a87b6100820d48b1401bf83a8cf6f046"
}

