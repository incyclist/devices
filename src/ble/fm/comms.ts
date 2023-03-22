import { BleProtocol, BleWriteProps, IBlePeripheralConnector } from "../types";
import { CSC_MEASUREMENT, CSP_MEASUREMENT, FTMS, FTMS_CP, FTMS_STATUS, HR_MEASUREMENT, INDOOR_BIKE_DATA } from "../consts";
import { IndoorBikeData, IndoorBikeFeatures } from "./types";
import { BleComms } from "../base/comms";
import { LegacyProfile } from "../../antv2/types";




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
    AverageSpeedSupported: bit(0),                  // 0x0001
    CadenceSupported: bit(1),                       // 0x0002
    TotalDistanceSupported: bit(2),                 // 0x0004
    InclinationSupported: bit(3),                   // 0x0008
    ElevationGainSupported: bit(4),                 // 0x0010
    PaceSupported: bit(5),                          // 0x0020
    StepCountSupported: bit(6),                     // 0x0040
    ResistanceLevelSupported: bit(7),               // 0x0080
    StrideCountSupported: bit(8),                   // 0x0100
    ExpendedEnergySupported: bit(9),                // 0x0200
    HeartRateMeasurementSupported: bit(10),         // 0x0400
    MetabolicEquivalentSupported: bit(11),          // 0x0800
    ElapsedTimeSupported: bit(12),                  // 0x1000
    RemainingTimeSupported: bit(13),                // 0x2000
    PowerMeasurementSupported: bit(14),             // 0x4000
    ForceOnBeltAndPowerOutputSupported: bit(15),    // 0x8000
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
  

export default class BleFitnessMachineDevice extends BleComms {
    static protocol: BleProtocol = 'fm'
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

    static isMatching(characteristics: string[]): boolean {
        if (!characteristics)
            return false;

        const hasStatus =  characteristics.find( c => c===FTMS_STATUS)!==undefined
        const hasCP = characteristics.find( c => c===FTMS_CP)!==undefined
        const hasIndoorBike = characteristics.find( c => c===INDOOR_BIKE_DATA)!==undefined

        return hasStatus && hasCP && hasIndoorBike;
    }

    async subscribeWriteResponse(cuuid: string) {

        this.logEvent({message:'subscribe to CP response',characteristics:cuuid})
        const connector = this.ble.peripheralCache.getConnector( this.peripheral)

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

    subscribeAll(conn?: IBlePeripheralConnector):Promise<void> {

        const characteristics = [ INDOOR_BIKE_DATA, FTMS_STATUS,FTMS_CP ]

        if (!this.features || (this.features && this.features.cadence))
            characteristics.push(CSC_MEASUREMENT)
        if (!this.features || (this.features && this.features.power))
            characteristics.push(CSP_MEASUREMENT)
        if (!this.features || (this.features && this.features.heartrate))
            characteristics.push(HR_MEASUREMENT)           

        return this.subscribeMultiple(characteristics,conn)

    }


    async init(): Promise<boolean> {
        try {

            
            //await this.subscribeWriteResponse(FTMS_CP)            
            await super.initDevice();
            await this.getFitnessMachineFeatures();
            this.logEvent({message: 'device info', deviceInfo:this.deviceInfo, features:this.features })
            return true;
            
        }
        catch (err) {
            this.logEvent( {message:'error',fn:'BleFitnessMachineDevice.init()',error:err.message||err, stack:err.stack})

            return false
        }
    }


    async onDisconnect():Promise<void> {
        super.onDisconnect();
        this.hasControl = false;
    }

    getProfile(): LegacyProfile {
        return 'Smart Trainer';
    }

    getProtocol(): BleProtocol {
        return BleFitnessMachineDevice.protocol
    }

    getServiceUUids(): string[] {
        return BleFitnessMachineDevice.services;
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
                const power = (fitnessMachine & FitnessMachineFeatureFlag.PowerMeasurementSupported) !== 0
                const heartrate = (fitnessMachine & FitnessMachineFeatureFlag.HeartRateMeasurementSupported) !==0
                const cadence = (fitnessMachine & FitnessMachineFeatureFlag.CadenceSupported)!==0

                const setSlope = (targetSettings & TargetSettingFeatureFlag.IndoorBikeSimulationParametersSupported)!==0  
                                || (targetSettings & TargetSettingFeatureFlag.InclinationTargetSettingSupported)!==0  

                const setPower = (targetSettings & TargetSettingFeatureFlag.PowerTargetSettingSupported)!==0  

                this.features = {fitnessMachine, targetSettings,power, heartrate, cadence, setPower, setSlope}

                
                this.logEvent( {message:'supported Features: ',fatures:this.features, power, heartrate, cadence})
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
