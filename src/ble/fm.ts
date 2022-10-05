import { BleDevice } from './ble-device';
import BleInterface from './ble-interface';
import BleProtocol from './incyclist-protocol';
import { BleDeviceClass, BleWriteProps } from './ble';
import DeviceAdapter,{ DeviceData } from '../Device';
import { DeviceProtocol } from '../DeviceProtocol';
import {EventLogger} from 'gd-eventlog';
import CyclingMode from '../CyclingMode';

import PowerMeterCyclingMode from '../modes/power-meter';
import { IncyclistBikeData } from '../CyclingMode';
import FtmsCyclingMode from './ble-st-mode';
import BleERGCyclingMode from './ble-erg-mode';
import {FTMS, FTMS_CP,FTMS_STATUS,INDOOR_BIKE_DATA, TACX_FE_C_RX, TACX_FE_C_TX} from './consts'
import BlePeripheralConnector from './ble-peripheral';

const sleep = (ms) => new Promise( resolve=> setTimeout(resolve,ms))

const cwABike = {
    race: 0.35,
    triathlon:0.29,
    mountain: 0.57
}
const cRR = 0.0036;					// http://www.radpanther.de/index.php?id=85  -- Conti GP 4000 RS

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

const enum FitnessMachineStatusOpCode   {
    Reset = 0x01,
    FitnessMachineStoppedOrPaused = 0x02,
    FitnessMachineStoppedBySafetyKey = 0x03,
    FitnessMachineStartedOrResumed = 0x04,
    TargetSpeedChanged = 0x05,
    TargetInclineChanged = 0x06,
    TargetResistanceLevelChanged = 0x07,
    TargetPowerChanged = 0x08,
    TargetHeartRateChanged = 0x09,
    TargetExpendedEnergyChanged = 0x0A,
    // ignore 0x0B...0x11
    IndoorBikeSimulationParametersChanged =     0x12,
    WheelCircumferenceChanged = 0x13,
    SpinDownStatus = 0x14,
    TargetedCadenceChanged = 0x15,
    ControlPermissionLost = 0xFF
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

export type IndoorBikeData = {
    speed?: number;
    averageSpeed?: number;
    cadence?: number;
    averageCadence?: number;
    totalDistance?: number;
    resistanceLevel?: number;
    instantaneousPower?: number;
    averagePower?: number;

    totalEnergy?: number;
    energyPerHour?: number;
    energyPerMinute?: number;
    heartrate?: number;
    metabolicEquivalent?: number;
    time?: number;
    remainingTime?: number;
    raw?: string;

    targetPower?: number;
    targetInclination?: number;
    status?: string;
}

type IndoorBikeFeatures = {
    fitnessMachine: number;
    targetSettings: number;
}


export default class BleFitnessMachineDevice extends BleDevice {
    static services =  [FTMS];
    static characteristics =  [ '2acc', INDOOR_BIKE_DATA, '2ad6', '2ad8', FTMS_CP, FTMS_STATUS ];
    static detectionPriority = 100;

    data: IndoorBikeData
    features: IndoorBikeFeatures = undefined
    hasControl: boolean = false
    isCheckingControl: boolean = false;
    isCPSubscribed: boolean = false;

    crr: number = 0.0033;
    cw: number = 0.6;
    windSpeed = 0;
    wheelSize = 2100;

    constructor (props?) {
        super(props)
        this.data = {}
        this.services = BleFitnessMachineDevice.services;
        
    }

    isMatching(characteristics: string[]): boolean {
        if (!characteristics)
            return false;

        const hasStatus =  characteristics.find( c => c===FTMS_STATUS)!==undefined
        const hasCP = characteristics.find( c => c===FTMS_CP)!==undefined
        const hasIndoorBike = characteristics.find( c => c===INDOOR_BIKE_DATA)!==undefined

        return hasStatus && hasCP && hasIndoorBike;
    }

    async subscribeWriteResponse(cuuid: string) {

        this.logEvent({message:'subscribe to CP response',characteristics:cuuid})
        const connector = this.ble.getConnector( this.peripheral)

            const isAlreadySubscribed = connector.isSubscribed(cuuid)            
            if ( !isAlreadySubscribed) {   
                connector.removeAllListeners(cuuid);

                let prev= undefined;
                let prevTS = undefined;
                connector.on(cuuid, (uuid,data)=>{  

                    // Workaround App Verion 0.8.0
                    // This app release will send all events twice
                    // Therefore we need to filter out duplicate messages
                    const message = data.toString('hex');

                    if (prevTS && prev &&message===prev && Date.now()-prevTS<500) {
                        return;
                    }
                    prevTS = Date.now();
                    prev = message
                    // END Workouround
                    
                    
                    this.onData(uuid,data)
                })
                await connector.subscribe(cuuid)
            }
            
    }

    subscribeAll(conn?: BlePeripheralConnector):Promise<void> {
        return new Promise ( resolve => {
            const characteristics = [ INDOOR_BIKE_DATA, FTMS_STATUS,FTMS_CP]
            const timeout = Date.now()+5500;

            const iv = setInterval( ()=> {
                const subscriptionStatus = characteristics.map( c => this.subscribedCharacteristics.find( s=> s===c)!==undefined)
                const done = subscriptionStatus.filter(s=> s===true).length === characteristics.length;
                if (done || Date.now()>timeout) {
                    clearInterval(iv)
                    resolve();
                }



            },100)

            try {
                const connector = conn || this.ble.getConnector(this.peripheral)
    
    
                
                for (let i=0; i<characteristics.length;i++)
                {
                    const c = characteristics[i]
                    const isAlreadySubscribed = connector.isSubscribed(c)            
                    if ( !isAlreadySubscribed) {   
                        connector.removeAllListeners(c);
    
                        connector.on(c, (uuid,data)=>{  
                            this.onData(uuid,data)
                        })
                        connector.subscribe(c);
                        this.subscribedCharacteristics.push(c)
                    }
                }
    
            }
            catch (err) {
                this.logEvent({message:'Error', fn:'subscribeAll()', error:err.message, stack:err.stack})
    
            }
            
        })

    }


    async init(): Promise<boolean> {
        try {

            
            //await this.subscribeWriteResponse(FTMS_CP)            
            await super.initDevice();
            await this.getFitnessMachineFeatures();
            this.logEvent({message: 'device info', deviceInfo:this.deviceInfo, features:this.features })

            
            
        }
        catch (err) {
            this.logEvent( {message:'error',fn:'BleFitnessMachineDevice.init()',error:err.message||err, stack:err.stack})

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
        return this.features===undefined || 
            ((this.features.targetSettings & TargetSettingFeatureFlag.IndoorBikeSimulationParametersSupported)!==0)
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
            this.logEvent({message:'error',fn:'parseHrm()',error:err.message|err, stack:err.stack})

        }
        return { ...this.data, raw:`2a37:${data.toString('hex')}`};
    }

    setCrr(crr:number) { this.crr = crr;}
    getCrr():number { return this.crr}
    
    setCw(cw:number) { this.cw = cw}
    getCw(): number { return this.cw}

    setWindSpeed(windSpeed:number) {this.windSpeed = windSpeed}
    getWindSpeed():number { return this.windSpeed}

    parseIndoorBikeData(_data: Uint8Array):IndoorBikeData { 
        const data:Buffer = Buffer.from(_data);
        try {
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
                this.data.totalDistance = (dvHigh<<8) +dvLow;
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
                this.data.totalEnergy = data.readUInt16LE(offset); offset+=2;
                this.data.energyPerHour = data.readUInt16LE(offset); offset+=2;
                this.data.energyPerMinute = data.readUInt8(offset); offset+=1;
            }
    
            if (flags & IndoorBikeDataFlag.HeartRatePresent) {
                this.data.heartrate = data.readUInt8(offset); offset+=1;
            }
            if (flags & IndoorBikeDataFlag.MetabolicEquivalentPresent) {
                this.data.metabolicEquivalent = data.readUInt8(offset)/10; offset+=2;
            }
            if (flags & IndoorBikeDataFlag.ElapsedTimePresent) {
                this.data.time = data.readUInt16LE(offset); offset+=2;
            }
            if (flags & IndoorBikeDataFlag.RemainingTimePresent) {
                this.data.remainingTime = data.readUInt16LE(offset); offset+=2;
            }
    
        }
        catch(err) {
            this.logEvent({message:'error',fn:'parseIndoorBikeData()',error:err.message|err, stack:err.stack})
        }
        return { ...this.data, raw:`2ad2:${data.toString('hex')}`};

    }

    parseFitnessMachineStatus(_data: Uint8Array):IndoorBikeData {  
        const data:Buffer = Buffer.from(_data);
        try {
            const OpCode = data.readUInt8(0);
            switch(OpCode) {
                case FitnessMachineStatusOpCode.TargetPowerChanged:
                    this.data.targetPower = data.readInt16LE(1);
                    break;
                case FitnessMachineStatusOpCode.TargetInclineChanged:
                    this.data.targetInclination = data.readInt16LE(1)/10;
                    break;
                case FitnessMachineStatusOpCode.FitnessMachineStartedOrResumed:
                    this.data.status = "STARTED"
                    break;
                case FitnessMachineStatusOpCode.FitnessMachineStoppedBySafetyKey:
                case FitnessMachineStatusOpCode.FitnessMachineStoppedOrPaused:
                    this.data.status = "STOPPED"
                    break;
                case FitnessMachineStatusOpCode.SpinDownStatus:
                    const spinDownStatus = data.readUInt8(1);
                    switch (spinDownStatus) {
                        case 1: this.data.status = "SPIN DOWN REQUESTED"; break;
                        case 2: this.data.status = "SPIN DOWN SUCCESS"; break;
                        case 3: this.data.status = "SPIN DOWN ERROR"; break;
                        case 4: this.data.status = "STOP PEDALING"; break;
                        default: break;
                    }
                }
    
        }
        catch(err) {
            this.logEvent({message:'error',fn:'parseFitnessMachineStatus()',error:err.message|err, stack:err.stack})
        }

        return { ...this.data, raw:`2ada:${data.toString('hex')}`};
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
                this.logEvent( {message:'supported Features: ',fatures:this.features})
            }
    
        }
        catch(err) {
            this.logEvent({message:'could not read FitnessMachineFeatures', error:err.message, stack: err.stack})
        }

        
    }

    onData(characteristic:string,data: Buffer):boolean {       
           
        const hasData = super.onData(characteristic,data);
        if (!hasData)
            return false;

        const uuid = characteristic.toLocaleLowerCase();




        let res = undefined
        switch(uuid) {
            case INDOOR_BIKE_DATA:    //  name: 'Indoor Bike Data',
                res = this.parseIndoorBikeData(data)
                break;
            case '2a37':     //  name: 'Heart Rate Measurement',
                res = this.parseHrm(data)
                break;
            case FTMS_STATUS:     //  name: 'Fitness Machine Status',
                res = this.parseFitnessMachineStatus(data)
                break;
            case '2a63':
            case '2a5b':
            case '347b0011-7635-408b-8918-8ff3949ce592':
                //this.logger.logEvent( {message:'onBleData',raw:`${uuid}:${data.toString('hex')}`})        
                break;

            default:    // ignore
                break;

        }
        if (res) {
            this.emit('data', res)
            return false;
        }


        // we might also get: 
        // '2a63' => Cycling Power Measurement
        // '2a5b' => CSC Measurement
        // '347b0011-7635-408b-8918-8ff3949ce592' => Elite 
        return true;
    }

    async writeFtmsMessage(requestedOpCode, data, props?:BleWriteProps) {
        
        try {

            this.logEvent({message:'fmts:write', data:data.toString('hex')})
            const res = await this.write( FTMS_CP, data, props )

            const responseData = Buffer.from(res)

            const opCode = responseData.readUInt8(0)
            const request = responseData.readUInt8(1)
            const result = responseData.readUInt8(2)

            if (opCode !== OpCode.ResponseCode || request!==requestedOpCode)
                throw new Error('Illegal response ')


            this.logEvent({message:'fmts:write result', res,result})
                
            return result                        
        }
        catch(err) {
            this.logEvent({message:'fmts:write failed', opCode: requestedOpCode, reason: err.message})
            return OpCodeResut.OperationFailed
        } 
    }

    async requestControl(): Promise<boolean> {
        
        let to = undefined;
        if (this.isCheckingControl) {
            to = setTimeout( ()=>{}, 3500)
        }

        if (this.hasControl)
            return true;

        this.logEvent( {message:'requestControl'})
        this.isCheckingControl = true;
        const data = Buffer.alloc(1)
        data.writeUInt8(OpCode.RequestControl,0)

        const res = await this.writeFtmsMessage(OpCode.RequestControl, data , {timeout:5000})
        if (res===OpCodeResut.Success) {
            this.hasControl = true
        }
        else {
            this.logEvent( {message:'requestControl failed'})
        }
        this.isCheckingControl = false;
        if (to) clearTimeout(to)

        return this.hasControl;
    }

    async setTargetPower( power: number): Promise<boolean> {
        this.logEvent( {message:'setTargetPower', power, skip:(this.data.targetPower!==undefined && this.data.targetPower===power)})

        // avoid repeating the same value
        if (this.data.targetPower!==undefined && this.data.targetPower===power)
            return true;

        if (!this.hasControl)
            return;

        const hasControl = await this.requestControl(); 
        if (!hasControl) {
            this.logEvent({message: 'setTargetPower failed',reason:'control is disabled'})
            return true;
        }
        
   
        const data = Buffer.alloc(3)
        data.writeUInt8(OpCode.SetTargetPower,0)
        data.writeInt16LE( Math.round(power), 1)

        const res = await this.writeFtmsMessage( OpCode.SetTargetPower, data )
        return ( res===OpCodeResut.Success)    
    }

    async setSlope(slope) {
        this.logEvent( {message:'setSlope', slope})

        const hasControl = await this.requestControl(); 
        if (!hasControl)
            return;

        const {windSpeed,crr, cw} = this;
        return await this.setIndoorBikeSimulation( windSpeed, slope, crr, cw)
    }

    async setTargetInclination( inclination: number): Promise<boolean> {
        // avoid repeating the same value
        if (this.data.targetInclination!==undefined && this.data.targetInclination===inclination)
            return true;

        if (!this.hasControl)
        return;

        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'setTargetInclination failed',reason:'control is disabled'})
            return false;
        }
    
        const data = Buffer.alloc(3)
        data.writeUInt8(OpCode.SetTargetInclination,0)
        data.writeInt16LE( Math.round(inclination*10), 1)

        const res = await this.writeFtmsMessage( OpCode.SetTargetInclination, data )
        return ( res===OpCodeResut.Success)    
    }


    async setIndoorBikeSimulation( windSpeed:number, gradient:number, crr:number, cw:number): Promise<boolean> {
        //if (!this.hasControl)
        //    return;

        const hasControl = await this.requestControl(); 
        if (!hasControl) {
            this.logEvent({message: 'setIndoorBikeSimulation failed',reason:'control is disabled'})
            return false;
        }
    
    
        const data = Buffer.alloc(7)
        data.writeUInt8(OpCode.SetIndoorBikeSimulation,0)
        data.writeInt16LE( Math.round(windSpeed*1000), 1)
        data.writeInt16LE( Math.round(gradient*100), 3)
        data.writeUInt8( Math.round(crr*10000), 5)
        data.writeUInt8( Math.round(cw*100), 6)

        const res = await this.writeFtmsMessage( OpCode.SetIndoorBikeSimulation, data )
        return ( res===OpCodeResut.Success)    
    }


    async startRequest(): Promise<boolean> {
        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'startRequest failed',reason:'control is disabled'})
            return false;
        }
    
        const data = Buffer.alloc(1)
        data.writeUInt8(OpCode.StartOrResume,0)

        const res = await this.writeFtmsMessage( OpCode.StartOrResume, data )
        return ( res===OpCodeResut.Success)    
    }

    async stopRequest(): Promise<boolean> {
        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'stopRequest failed',reason:'control is disabled'})
            return false;
        }
    
        const data = Buffer.alloc(2)
        data.writeUInt8(OpCode.StopOrPause,0)
        data.writeUInt8(1,1)

        const res = await this.writeFtmsMessage( OpCode.StopOrPause, data )
        return ( res===OpCodeResut.Success)    
    }

    async PauseRequest(): Promise<boolean> {
        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'PauseRequest failed',reason:'control is disabled'})
            return false;
        }
    
        const data = Buffer.alloc(2)
        data.writeUInt8(OpCode.StopOrPause,0)
        data.writeUInt8(2,1)

        const res = await this.writeFtmsMessage( OpCode.StopOrPause, data )
        return ( res===OpCodeResut.Success)    
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
    cyclingMode: CyclingMode
    distanceInternal: number = 0;
    prevDataTS: number;


    constructor( device: BleDeviceClass, protocol: BleProtocol) {
        super(protocol);
        this.device = device as BleFitnessMachineDevice;
        this.ble = protocol.ble
        this.cyclingMode = this.getDefaultCyclingMode()
        this.logger = new EventLogger('BLE-FM')

        if (this.device)
            this.device.setLogger(this.logger)
        
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
        const profile = this.device ? this.device.getProfile() : undefined;
        return profile || 'Smart Trainer'
    }

    getName() {
        return `${this.device.name}`        
    }

    getDisplayName() {
        return this.getName();
    }

    getSupportedCyclingModes() : Array<any> {
        return [FtmsCyclingMode,BleERGCyclingMode, PowerMeterCyclingMode]
    }

    setCyclingMode(mode: string | CyclingMode, settings?: any): void {
        let selectedMode :CyclingMode;

        if ( typeof mode === 'string') {
            const supported = this.getSupportedCyclingModes();
            const CyclingModeClass = supported.find( M => { const m = new M(this); return m.getName() === mode })
            if (CyclingModeClass) {
                this.cyclingMode = new CyclingModeClass(this,settings);    
                return;
            }
            selectedMode = this.getDefaultCyclingMode();
        }
        else {
            selectedMode = mode;
        }
        this.cyclingMode = selectedMode;        
        this.cyclingMode.setSettings(settings);
        
    }
    
    getCyclingMode(): CyclingMode {
        if (!this.cyclingMode)
            this.cyclingMode =  this.getDefaultCyclingMode();
        return this.cyclingMode

    }
    getDefaultCyclingMode(): CyclingMode {
        return new FtmsCyclingMode(this);
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
        this.logger.logEvent({message: 'ftms: start requested', profile:this.getProfile(),props})

        if ( this.ble.isScanning())
            await this.ble.stopScan();
            
        try {
            const bleDevice = await this.ble.connectDevice(this.device) as BleFitnessMachineDevice
            bleDevice.setLogger(this.logger);

            if (bleDevice) {
                this.device = bleDevice;

                const mode = this.getCyclingMode()
                if (mode && mode.getSetting('bikeType')) {
                    const bikeType = mode.getSetting('bikeType').toLowerCase();
                    this.device.setCrr(cRR);
                    
                    switch (bikeType)  {
                        case 'race': this.device.setCw(cwABike.race); break;
                        case 'triathlon': this.device.setCw(cwABike.triathlon); break;
                        case 'mountain': this.device.setCw(cwABike.mountain); break;
                    }        
                }

                let hasControl = await this.device.requestControl();
                if ( !hasControl) {
                    let retry = 1;
                    while(!hasControl && retry<3) {
                        await sleep(1000);
                        hasControl = await this.device.requestControl();
                        retry++;
                    }
                }
                if (!hasControl)
                    throw new Error( 'could not establish control')

               
                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendUpdate(startRequest);

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

    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused ||!this.device)
            return;

        const update = this.getCyclingMode().sendBikeUpdate(request)
        this.logger.logEvent({message: 'send bike update requested', profile:this.getProfile(), update, request})

        if (update.slope!==undefined) {
            await this.device.setSlope(update.slope)
        } 

        if (update.targetPower!==undefined) {
            await this.device.setTargetPower(update.targetPower)
        } 

        //this.logger.logEvent({message:'sendUpdate',request});    
        
    } 


    pause(): Promise<boolean> { this.paused = true; return Promise.resolve(true)}
    resume(): Promise<boolean> { this.paused = false; return Promise.resolve(true)}
}

