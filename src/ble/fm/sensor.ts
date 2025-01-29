import { LegacyProfile } from "../../antv2/types";
import { BleProtocol, BleWriteProps  } from "../types";
import { IndoorBikeData, IndoorBikeFeatures } from "./types";
import { FTMS, FTMS_CP, FTMS_STATUS, INDOOR_BIKE_DATA } from "../consts";
import { TBleSensor } from "../base/sensor";
import { beautifyUUID } from "../utils";
import { IndoorBikeDataFlag, FitnessMachineStatusOpCode, FitnessMachineFeatureFlag, TargetSettingFeatureFlag, OpCode, OpCodeResut as OpCodeResult } from "./consts";


export default class BleFitnessMachineDevice extends TBleSensor {
    static readonly profile: LegacyProfile = 'Smart Trainer'
    static readonly protocol: BleProtocol = 'fm'
    static readonly services =  [FTMS];
    static readonly characteristics =  [ '2acc', INDOOR_BIKE_DATA, '2ad6', '2ad8', FTMS_CP, FTMS_STATUS ];
    static readonly detectionPriority:number = 100;

    protected data: IndoorBikeData
    protected _features: IndoorBikeFeatures = undefined
    protected hasControl: boolean = false
    protected isCheckingControl: boolean = false;
    protected isCPSubscribed: boolean = false;

    protected crr: number = 0.0033;
    protected cw: number = 0.6;
    protected windSpeed = 0;
    protected wheelSize = 2100;

    constructor (peripheral, props?) {
        super(peripheral,props)

        this.reset()
        
    }

    public get features(): IndoorBikeFeatures {
        return this._features
    }
    reset() {
        this.data = {}
    
    }

    protected getRequiredCharacteristics():Array<string> {
        return [INDOOR_BIKE_DATA,'2a37',FTMS_STATUS ]
    }

    onData(characteristic:string,characteristicData: Buffer):boolean {       
        const data = Buffer.from(characteristicData);
        try {
            const hasData = super.onData(characteristic,data);

            if (!hasData)
                return false;
    
            const uuid = beautifyUUID( characteristic).toLowerCase();
    
    
    
    
            let res = undefined
            switch( uuid ) {
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
        catch(err) {
            this.logEvent({message:'Error',fn:'onData',error:err.message, stack:err.stack})
            return false
        }
    }


    setCrr(crr:number) { this.crr = crr;}
    getCrr():number { return this.crr}
    
    setCw(cw:number) { this.cw = cw}
    getCw(): number { return this.cw}

    setWindSpeed(windSpeed:number) {this.windSpeed = windSpeed}
    getWindSpeed():number { return this.windSpeed}

    async requestControl(): Promise<boolean> {

        if (this.hasControl)
            return true;

        // If we know from features flag that setPower and setSlope are not supported, just ignore
        if (this.features?.setPower===false && this.features?.setSlope===false)
            return true;


        this.logEvent( {message:'requestControl'})
        this.isCheckingControl = true;
        const data = Buffer.alloc(1)
        data.writeUInt8(OpCode.RequestControl,0)

        const res = await this.writeFtmsMessage(OpCode.RequestControl, data , {timeout:5000})
        if (res===OpCodeResult.Success) {
            this.hasControl = true
        }
        else {
            this.logEvent( {message:'requestControl failed', reason:res})
        }
        this.isCheckingControl = false;

        return this.hasControl;
    }

    async setTargetPower( power: number): Promise<boolean> {
        this.logEvent( {message:'setTargetPower', power, skip:(this.data.targetPower!==undefined && this.data.targetPower===power)})

        // avoid repeating the same value
        if (this.data.targetPower!==undefined && this.data.targetPower===power)
            return true;

        const hasControl = await this.requestControl(); 
        if (!hasControl) {
            this.logEvent({message: 'setTargetPower failed',reason:'control is disabled'})
            return true;
        }
        
   
        const data = Buffer.alloc(3)
        data.writeUInt8(OpCode.SetTargetPower,0)
        data.writeInt16LE( Math.round(power), 1)

        const res = await this.writeFtmsMessage( OpCode.SetTargetPower, data )
        if (res === OpCodeResult.ControlNotPermitted) {
            this.hasControl = false            
        }
        return ( res===OpCodeResult.Success)    
    }

    async setSlope(slope) {
        this.logEvent( {message:'setSlope', slope})

        const {windSpeed,crr, cw} = this;
        return await this.setIndoorBikeSimulation( windSpeed, slope, crr, cw)
    }



    protected parseHrm(_data: Uint8Array):IndoorBikeData { 
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

    protected parseIndoorBikeData(_data: Uint8Array):IndoorBikeData { 
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
                this.data.remainingTime = data.readUInt16LE(offset); 
            }
    
        }
        catch(err) {
            this.logEvent({message:'error',fn:'parseIndoorBikeData()',error:err.message|err, stack:err.stack})
        }
        return { ...this.data, raw:`2ad2:${data.toString('hex')}`};

    }

    protected parseFitnessMachineStatus(_data: Uint8Array):IndoorBikeData {  
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
                    {
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
    
        }
        catch(err) {
            this.logEvent({message:'error',fn:'parseFitnessMachineStatus()',error:err.message|err, stack:err.stack})
        }

        return { ...this.data, raw:`2ada:${data.toString('hex')}`};
    }

    
    async getFitnessMachineFeatures():Promise<IndoorBikeFeatures|undefined> {
        if (this._features)
            return this._features;
        
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

                this._features = {fitnessMachine, targetSettings,power, heartrate, cadence, setPower, setSlope}


                this.logEvent( {message:'supported Features: ',fatures:this._features, power, heartrate, cadence})
            }
    
        }
        catch(err) {
            this.logEvent({message:'could not read FitnessMachineFeatures', error:err.message, stack: err.stack})
            return undefined
        }

        
    }


    protected async writeFtmsMessage(requestedOpCode, data, props?:BleWriteProps) {
        
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
            return OpCodeResult.OperationFailed
        } 
    }


    async setTargetInclination( inclination: number): Promise<boolean> {
        // avoid repeating the same value
        if (this.data.targetInclination!==undefined && this.data.targetInclination===inclination)
            return true;

        // If we know from features flag that setSlope is not supported, just ignore
        if (this.features?.setSlope===false)
            return true;

        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'setTargetInclination failed',reason:'control is disabled'})
            return false;
        }
    
        const data = Buffer.alloc(3)
        data.writeUInt8(OpCode.SetTargetInclination,0)
        data.writeInt16LE( Math.round(inclination*10), 1)

        const res = await this.writeFtmsMessage( OpCode.SetTargetInclination, data )
        return ( res===OpCodeResult.Success)    
    }


    async setIndoorBikeSimulation( windSpeed:number, gradient:number, crr:number, cw:number): Promise<boolean> {


        // If we know from features flag that setPower is not supported, just ignore
        if (this.features?.setPower===false)
            return true;

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
        if (res === OpCodeResult.ControlNotPermitted) {
            this.hasControl = false            
        }

        return ( res===OpCodeResult.Success)    
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
        return ( res===OpCodeResult.Success)    
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
        return ( res===OpCodeResult.Success)    
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
        return ( res===OpCodeResult.Success)    
    }

}
