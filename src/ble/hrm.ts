import { BleDevice } from './ble-device';
import BleInterface from './ble-interface';
import DeviceAdapter from '../device';
import { DeviceProtocol } from '../protocol';
import { BleDeviceClass } from './ble';
import BleProtocol from './incyclist-protocol';
import { EventLogger } from 'gd-eventlog';

type HrmData = {
    heartrate:number;
    rr:number;
    raw: string
}
export default class BleHrmDevice extends BleDevice {
    static services =  ['180d'];
    static characteristics =  ['2a37', '2a38', '2a39', '2a3c'];
    static detectionPriority = 1;
    
    heartrate: number;
    rr: number;

    constructor(props?) {
        super(props);
        this.heartrate = undefined
        this.rr = undefined
    }

    getProfile(): string {
        return 'Heartrate Monitor';
    }

    getServiceUUids(): string[] {
        return BleHrmDevice.services;
    }

    parseHrm(_data: Uint8Array):HrmData { 
        const data = Buffer.from(_data);

        try {                         
            const flags = data.readUInt8(0);

            let offset = 2;

            if ( flags % 1 === 0) { 
                this.heartrate = data.readUInt8(1);
            }
            else {
                this.heartrate = data.readUInt16LE(1);
                offset = 3
            }
            if ( flags % 0xF) {
                this.rr = (data.readUInt16LE(offset))/1024
            }
        }
        catch (err) { 

        }
        const {heartrate, rr} = this

        return {heartrate, rr,raw:data.toString('hex')}
    }

    onData(characteristic:string,data: Buffer):boolean {
        const hasData = super.onData(characteristic,data);
        if (!hasData)
            return;


        if (characteristic.toLocaleLowerCase() === '2a37') { //  name: 'Heart Rate Measurement',
            const res = this.parseHrm(data)
            this.emit('data', res)
            return false;
        }

        return true;
  
    }

}
BleInterface.register('BleHrmDevice','hr', BleHrmDevice,BleHrmDevice.services)


export class HrmAdapter extends DeviceAdapter {

    
    device: BleHrmDevice;
    ignore: boolean = false;
    ble:BleInterface
    protocol: DeviceProtocol;
    paused: boolean = false;
    logger: EventLogger;


    constructor( device: BleDeviceClass, protocol: BleProtocol) {
        super(protocol);
        this.device = device as BleHrmDevice;
        this.ble = protocol.ble
        this.logger = new EventLogger('Ble-HR')
        
    }

    isBike() { return false;}
    isHrm() { return true;}
    isPower() { return false; }

    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof HrmAdapter))
            return false;
        const adapter = device as HrmAdapter;
        return  (adapter.getName()===this.getName() && adapter.getProfile()===this.getProfile())
    }

   
    getProfile() {
        return 'Heartrate Monitor';
    }

    getName() {
        return `${this.device.name}`        
    }

    getDisplayName() {
        const {name,heartrate: hrm} = this.device;
        const hrmStr = hrm ? ` (${hrm})` : '';
        return `${name}${hrmStr}`
    }

    getPort():string {
        return 'ble' 
    }
    setIgnoreHrm(ignore) {
        this.ignore = ignore;
    }



    async start( props?: any ): Promise<any> {
        this.logger.logEvent({message: 'hrm: start requested', profile:this.getProfile(),props})
        try {
            const bleDevice = await this.ble.connectDevice(this.device) as BleHrmDevice
            if (bleDevice) {
                this.device = bleDevice;
                bleDevice.on('data', (data)=> {
                    if (this.onDataFn && !this.ignore && !this.paused)
                        this.onDataFn(data)
                    
                })
                return true;
            }    
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, profile:this.getProfile()})
            throw new Error(`could not start device, reason:${err.message}`)
        }
    }

    async stop(): Promise<boolean> { 
        this.logger.logEvent({message: 'stop requested', profile:this.getProfile()})

        return  this.device.disconnect();        
    }

    pause(): Promise<boolean> { this.paused = true; return Promise.resolve(true)}
    resume(): Promise<boolean> { this.paused = false; return Promise.resolve(true)}
}
