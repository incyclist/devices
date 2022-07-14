import { BleDevice } from './ble-device';
import BleInterface from './ble-interface';
import BleProtocol from './incyclist-protocol';
import { BleDeviceClass, uuid } from './ble';
import DeviceAdapter,{ DeviceData } from '../Device';
import { DeviceProtocol } from '../DeviceProtocol';
import {EventLogger} from 'gd-eventlog';
import CyclingMode from '../CyclingMode';

import PowerMeterCyclingMode from '../modes/power-meter';
import { IncyclistBikeData } from '../CyclingMode';

const FTMS_CP = '2ad9'

const enum OpCode   {
    RequestControl = 0x00,
    Reset = 0x01,
    SetTargetSpeed = 0x02,
    SetTargetInclination = 0x03,
    SetTargetResistance = 0x04,
    SetTargetPower = 0x05,
    SetTargetHeartRate = 0x06,
    StartOrResume = 0x07,
    StopOrPause = 0x08,
    //SetTargetedExpendedEnergy = 0x09,
    //SetTargetedNumberofSteps = 0x0A,
    SetIndoorBikeSimulation = 0x11,
    SetWheelCircumference = 0x12,
    SpinDownControl = 0x13,
    SetTargetedCadence = 0x14,
    ResponseCode = 0x80
}

const enum OpCodeResut   {
    Success = 0x01,
    OpCodeNotSupported = 0x02,
    InvalidParameter = 0x03,
    OperationFailed = 0x04,
    ControlNotPermitted = 0x05
}

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

const FitnessMachineFeatureFlag = {
    AverageSpeedSupported: bit(0),
    CadenceSupported: bit(1),
    TotalDistanceSupported: bit(2),
    InclinationSupported: bit(3),
    ElevationGainSupported: bit(4),
    PaceSupported: bit(5),
    StepCountSupported: bit(6),
    ResistanceLevelSupported: bit(7),
    StrideCountSupported: bit(8),
    ExpendedEnergySupported: bit(9),
    HeartRateMeasurementSupported: bit(10),
    MetabolicEquivalentSupported: bit(11),
    ElapsedTimeSupported: bit(12),
    RemainingTimeSupported: bit(13),
    PowerMeasurementSupported: bit(14),
    ForceOnBeltAndPowerOutputSupported: bit(15),
    UserDataRetentionSupported: bit(16)
}

const TargetSettingFeatureFlag = {
    SpeedTargetSettingSupported: bit(0),
    InclinationTargetSettingSupported: bit(1),
    ResistanceTargetSettingSupported: bit(2),
    PowerTargetSettingSupported: bit(3),
    HeartRateTargetSettingSupported: bit(4),
    TargetedExpendedEnergyConfigurationSupported: bit(5),
    TargetedStepNumberConfigurationSupported: bit(6),
    TargetedStrideNumberConfigurationSupported: bit(7),
    TargetedDistanceConfigurationSupported: bit(8),
    TargetedTrainingTimeConfigurationSupported: bit(9),
    TargetedTimeInTwoHeartRateZonesConfigurationSupported: bit(10),
    TargetedTimeInThreeHeartRateZonesConfigurationSupported: bit(11),
    TargetedTimeInFiveHeartRateZonesConfigurationSupported: bit(12),
    IndoorBikeSimulationParametersSupported: bit(13),
    WheelCircumferenceConfigurationSupported: bit(14),
    SpinDownControlSupported: bit(15),
    TargetedCadenceConfigurationSupported: bit(16)
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

type IndoorBikeFeatures = {
    fitnessMachine: number;
    targetSettings: number;
}


export default class BleFitnessMachineDevice extends BleDevice {
    static services =  ['1826'];
    static characteristics =  [ '2acc', '2ad2', '2ad6', '2ad8', '2ad9', '2ada' ];
    
    data: IndoorBikeData
    features: IndoorBikeFeatures = undefined
    hasControl: boolean = false
    isCPSubscribed: boolean = false;

    constructor (props?) {
        super(props)
        this.data = {}
    }

    async init(): Promise<boolean> {
        try {
            this.logEvent({message: 'get device info'})
            await super.init();
            await this.getFitnessMachineFeatures();
            this.logEvent({message: 'device info', deviceInfo:this.deviceInfo, features:this.features })

            
            
        }
        catch (err) {
            return Promise.resolve(false)
        }
    }

    onDisconnect() {
        super.onDisconnect();
        this.hasControl = false;
    }

    getProfile(): string {
        return 'Smart Trainer';
    }

    getServiceUUids(): string[] {
        return BleFitnessMachineDevice.services;
    }

    isBike(): boolean {
        return this.features!==undefined && 
            (this.features.targetSettings & TargetSettingFeatureFlag.IndoorBikeSimulationParametersSupported)!==0
    }

    isPower(): boolean {
        if (this.hasService('1818'))
            return true;
        if (this.features===undefined)
            return false;
        const {fitnessMachine} = this.features

        if (fitnessMachine & FitnessMachineFeatureFlag.PowerMeasurementSupported)
            return true;
    }

    isHrm(): boolean {
        return this.hasService('180d') || (this.features && (this.features.fitnessMachine & FitnessMachineFeatureFlag.HeartRateMeasurementSupported)!==0);
    }

    parseHrm(_data: Uint8Array):IndoorBikeData { 
        const data = Buffer.from(_data);

        try {                         
            const flags = data.readUInt8(0);

            if ( flags % 1 === 0) { 
                this.data.heartrate = data.readUInt8(1);
            }
            else {
                this.data.heartrate = data.readUInt16LE(1);
            }
        }
        catch (err) { 

        }
        return { ...this.data, raw:data.toString('hex')};
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
            const dvLow  = data.readUInt8(offset); offset+=1;
            const dvHigh = data.readUInt16LE(offset); offset+=2;
            this.data.totalDistance = dvHigh<<8 +dvLow;
        }
        if (flags & IndoorBikeDataFlag.ResistanceLevelPresent) {
            this.data.resistanceLevel = data.readInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.InstantaneousPowerPresent) {
            this.data.instantaneousPower = data.readInt16LE(offset); offset+=2;
        }
        if (flags & IndoorBikeDataFlag.AveragePowerPresent) {
            this.data.averagePower = data.readInt16LE(offset); offset+=2;
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
    
    async getFitnessMachineFeatures() {
        if (this.features)
            return this.features;
        
        try {
            const data = await this.read('2acc')  // Fitness Machine Feature
            const buffer = data ? Buffer.from(data) : undefined
            
            if (buffer) {
                const fitnessMachine = buffer.readUInt32LE(0)
                const targetSettings = buffer.readUInt32LE(4)
                this.features = {fitnessMachine, targetSettings}
            }
    
        }
        catch(err) {
            this.logEvent({message:'could not read FitnessMachineFeatures', error:err.message, stack: err.stack})
        }

        
    }

    onData(characteristic:string,data: Buffer) {       
        if (characteristic.toLocaleLowerCase() === '2ad2') { //  name: 'Indoor Bike Data',
            const res = this.parseIndoorBikeData(data)
            this.emit('data', res)
        }
        if (characteristic.toLocaleLowerCase() === '2a37') { //  name: 'Heart Rate Measurement',
            const res = this.parseHrm(data)
            this.emit('data', res)
        }

        
  
    }

    async requestControl() {
        if (this.hasControl)
            return true;

        const data = Buffer.alloc(1)
        data.writeUInt8(OpCode.RequestControl,0)

        const success = await this.write( FTMS_CP, data )
        if (success)
            this.hasControl = true;

        return this.hasControl;
    }

    async setTargetPower( power: number) {
        const hasControl = await this.requestControl();
        if (!hasControl) throw new Error ( 'setTargetPower not possible - control is disabled')
        
        const data = Buffer.alloc(3)
        data.writeUInt8(OpCode.SetTargetPower,0)
        data.writeInt16LE( Math.round(power), 1)

        const res = await this.write( FTMS_CP, data )
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

    isBike() { return this.device.isBike()}
    isHrm() { return this.device.isHrm() }
    isPower() { return this.device.isPower() }
    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof FmAdapter))
            return false;
        const adapter = device as FmAdapter;
        return  (adapter.getName()===this.getName() && adapter.getProfile()===this.getProfile())
    }

   
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

        if ( this.ble.isScanning())
            await this.ble.stopScan();
            
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

