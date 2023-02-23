import { BleMockPeripheral } from "../bindings/mock";
import { PrimaryService, StaticReadCharacteristic,MockCharacteristic, StaticNotifyCharacteristic } from "../bindings/types";


class HeartRateMeasuremenCharacteristic extends StaticNotifyCharacteristic {
    heartrate: number;

    constructor( uuid:string, description:string,heartrate:number=0) {
        super(uuid,description)
        this.heartrate = heartrate
        this.value = Buffer.from(this.heartrate.toString())        
    }

    notify() {
        const buffer = Buffer.alloc(2);

        buffer.writeUInt8(0,0)                   // Flags: only HR, no RR
        buffer.writeUInt8(this.heartrate,1)     

        this.emit('data', buffer)
    }
}

const HR: PrimaryService = {
    uuid: "180d",
    characteristics: [
        new HeartRateMeasuremenCharacteristic('2a37','Heart Rate Measurement',60 )
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

interface BleHrMockPeripheral extends BleMockPeripheral {
    setNotifyFrequency: (ms:number) => void;
    setHeartrate: (hr:number)=>void
}

export const HrMock: BleHrMockPeripheral = {
    services: [HR,DIS],
    id: "a87b6100820d48b1401bf83a8cf6f046",
    name: "HRM-Mock",
    address: "a87b6100820d48b1401bf83a8cf6f046",

    setNotifyFrequency: (ms:number) => {
        (HR.characteristics[0] as HeartRateMeasuremenCharacteristic).notifyFrequency = ms;
    },

    setHeartrate: (hr:number) => {
        (HR.characteristics[0] as HeartRateMeasuremenCharacteristic).heartrate = hr;
    }
}

