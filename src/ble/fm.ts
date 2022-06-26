import { BleDevice } from './ble-device';
import BleInterface from './ble-interface';
import BleProtocol from './incyclist-protocol';
import { BleDeviceClass } from './ble';
import DeviceAdapter,{ DeviceData } from '../Device';
import { DeviceProtocol } from '../DeviceProtocol';
import {EventLogger} from 'gd-eventlog';
import CyclingMode from '../CyclingMode';

import PowerMeterCyclingMode from '../modes/power-meter';
import { IncyclistBikeData } from '../CyclingMode';

const bit = (nr) => (1 << nr);

const IndoorBikeDataFlag = {
    MoreData: bit(0),                       // 0x01
    AverageSpeedPresent: bit(1),            // 0x02
    InstantaneousCadence: bit(2),           // 0x04
    AverageCadencePresent: bit(3),          // 0x08
    TotalDistancePresent: bit(4),           // 0x10
    ResistanceLevelPresent: bit(5),         // 0x20
    InstantaneousPowerPresent: bit(6),      // 0x40
    AveragePowerPresent: bit(7),            // 0x80
    ExpendedEnergyPresent: bit(8),          // 0x100
    HeartRatePresent: bit(9),               // 0x200
    MetabolicEquivalentPresent: bit(10),    // 0x400
    ElapsedTimePresent: bit(11),            // 0x800
    RemainingTimePresent: bit(12)           // 0x1000
}

  
type PowerData = {
    instantaneousPower?: number;
    balance?: number;
    accTorque?: number;
    time: number;
    rpm: number;
    raw?: string;
}

type IndoorBikeData = {
    speed?: number;
    averageSpeed?: number;
    cadence?: number;
    averageCadence?: number;
    totalDistance?: number;
    resistanceLevel?: number;
    instantaneousPower?: number;
    averagePower?: number;
    expendedEnergy?: number;
    heartrate?: number;
    metabolicEquivalent?: number;
    time?: number;
    remainingTime?: number;
    raw?: string;
}


export default class BleFitnessMachineDevice extends BleDevice {
    static services =  ['1826'];
    static characteristics =  [ '2acc', '2ad2', '2ad6', '2ad8', '2ad9', '2ada' ];
    
    data: IndoorBikeData
    
    constructor (props?) {
        super(props)
        this.data = {}
    }

    getProfile(): string {
        return 'Smart Trainer';
    }

    getServiceUUids(): string[] {
        return BleFitnessMachineDevice.services;
    }

    parseIndoorBikeData(_data: Uint8Array):IndoorBikeData { 
        const data:Buffer = Buffer.from(_data);
        const flags = data.readUInt16LE(0)
        let offset = 2 ;
        

        
        if ((flags & IndoorBikeDataFlag.MoreData)===0) {
            this.data.speed = data.readUInt16LE(offset)/100; offset+=2;
        }
        if (flags & IndoorBikeDataFlag.AverageSpeedPresent) {
            this.data.averageSpeed = data.readUInt16LE(offset)/100; offset+=2;
        }
        if (flags & IndoorBikeDataFlag.InstantaneousCadence) {
            this.data.cadence = data.readUInt16LE(offset)/2; offset+=2;
        }
        if (flags & IndoorBikeDataFlag.AverageCadencePresent) {
            this.data.averageCadence = data.readUInt16LE(offset)/2; offset+=2;
        }

        if (flags & IndoorBikeDataFlag.TotalDistancePresent) {
            this.data.totalDistance = data.readUInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.ResistanceLevelPresent) {
            this.data.resistanceLevel = data.readUInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.InstantaneousPowerPresent) {
            this.data.instantaneousPower = data.readUInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.AveragePowerPresent) {
            this.data.averagePower = data.readUInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.ExpendedEnergyPresent) {
            this.data.expendedEnergy = data.readUInt16LE(offset); offset+=2;
        }

        if (flags & IndoorBikeDataFlag.HeartRatePresent) {
            this.data.heartrate = data.readUInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.MetabolicEquivalentPresent) {
            this.data.metabolicEquivalent = data.readUInt16LE(offset)/10; offset+=2;
        }
        if (flags & IndoorBikeDataFlag.ElapsedTimePresent) {
            this.data.time = data.readUInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.RemainingTimePresent) {
            this.data.remainingTime = data.readUInt16LE(offset); offset+=2;
        }

        return { ...this.data, raw:data.toString('hex')};

    }

    onData(characteristic:string,data: Buffer) {
        console.log(characteristic.toLocaleLowerCase(), data)
        
        if (characteristic.toLocaleLowerCase() === '2ad2') { //  name: 'Indoor Bike Data',
            const res = this.parseIndoorBikeData(data)
            this.emit('data', res)
        }
        
  
    }

    write(characteristic, data) {
        console.log('write',characteristic, data)
        return Promise.resolve(true);
    }
    read(characteristic) {
        
        console.log('read',characteristic)
        return Promise.resolve(Buffer.from([]));
    }

    reset() {
        this.data = {}
    
    }

}
BleInterface.register('BleFitnessMachineDevice','fm', BleFitnessMachineDevice,BleFitnessMachineDevice.services)

export class FmAdapter extends DeviceAdapter {

    
    device: BleFitnessMachineDevice;
    ignore: boolean = false;
    ble:BleInterface
    protocol: DeviceProtocol;
    paused: boolean = false;
    logger: EventLogger;
    mode: CyclingMode
    distanceInternal: number = 0;
    prevDataTS: number;


    constructor( device: BleDeviceClass, protocol: BleProtocol) {
        super(protocol);
        this.device = device as BleFitnessMachineDevice;
        this.ble = protocol.ble
        this.mode = this.getDefaultCyclingMode()
        this.logger = new EventLogger('BLE-FM')
        
    }

    isBike() { return true;}
    isHrm() { return false;}
    isPower() { return true; }
   
    getProfile() {
        return 'Smart Trainer';
    }

    getName() {
        return `${this.device.name}`        
    }

    getDisplayName() {
        return this.getName();
    }
    
    getCyclingMode(): CyclingMode {
        if (!this.mode)
            this.mode =  this.getDefaultCyclingMode();
        return this.mode

    }
    getDefaultCyclingMode(): CyclingMode {
        return new PowerMeterCyclingMode(this);
    }


    getPort():string {
        return 'ble' 
    }
    setIgnoreBike(ignore: any): void {
        this.ignore = ignore;
    }

    setIgnorePower(ignore: any): void {
        this.ignore = ignore;
    }

    onDeviceData(deviceData:PowerData):void {

        if (this.prevDataTS && Date.now()-this.prevDataTS<1000)
            return;
        this.prevDataTS = Date.now()
        

        this.logger.logEvent( {message:'onDeviceData',data:deviceData})        

        // transform data into internal structure of Cycling Modes
        let incyclistData = this.mapData(deviceData)              
        
        // let cycling mode process the data
        incyclistData = this.getCyclingMode().updateData(incyclistData);                    

        // transform data into structure expected by the application
        const data =  this.transformData(incyclistData);                  

        if (this.onDataFn && !this.ignore && !this.paused)
            this.onDataFn(data)

    }

    mapData(deviceData:IndoorBikeData): IncyclistBikeData{
        // update data based on information received from ANT+PWR sensor
        const data = {
            isPedalling: false,
            power: 0,
            pedalRpm: undefined,
            speed: 0,
            heartrate:0,
            distanceInternal:0,        // Total Distance in meters             
            slope:undefined,
            time:undefined
        }

        data.power = (deviceData.instantaneousPower!==undefined? deviceData.instantaneousPower :data.power);
        data.pedalRpm = (deviceData.cadence!==undefined? deviceData.cadence :data.pedalRpm) ;
        data.time = (deviceData.time!==undefined? deviceData.time :data.time);
        data.isPedalling = data.pedalRpm>0 || (data.pedalRpm===undefined && data.power>0);
        return data;
    }

    transformData( bikeData:IncyclistBikeData): DeviceData {
        if (this.ignore) {
            return {};
        }
        
        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance = Math.round(bikeData.distanceInternal-this.distanceInternal)
        }

        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        
        let data =  {
            speed: bikeData.speed,
            slope: bikeData.slope,
            power: bikeData.power!==undefined ? Math.round(bikeData.power) : undefined,
            cadence: bikeData.pedalRpm!==undefined ? Math.round(bikeData.pedalRpm) : undefined,
            distance,
            timestamp: Date.now()
        } as DeviceData;

        return data;
    }


    async start( props?: any ): Promise<any> {
        this.logger.logEvent({message: 'start requested', profile:this.getProfile(),props})
        try {
            const bleDevice = await this.ble.connectDevice(this.device) as BleFitnessMachineDevice
            if (bleDevice) {
                this.device = bleDevice;
                bleDevice.on('data', (data)=> {
                    this.onDeviceData(data)
                    
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
        this.distanceInternal = 0;
        this.device.reset();
        return  this.device.disconnect();        
    }

    pause(): Promise<boolean> { this.paused = true; return Promise.resolve(true)}
    resume(): Promise<boolean> { this.paused = false; return Promise.resolve(true)}
}

