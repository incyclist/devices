import { LegacyProfile } from "../../antv2/types.js";
import { BleProtocol, BleWriteProps, IBlePeripheral  } from "../types.js";
import { FtmsServiceData, IndoorBikeData, IndoorBikeFeatures } from "./types.js";
import { FTMS, FTMS_CP, FTMS_STATUS, INDOOR_BIKE_DATA, ROWER_DATA, TREADMILL_DATA } from "../consts.js";
import { TBleSensor } from "../base/sensor.js";
import { beautifyUUID, bit, matches } from "../utils.js";
import { IndoorBikeDataFlag, FitnessMachineStatusOpCode, FitnessMachineFeatureFlag, TargetSettingFeatureFlag, OpCode, OpCodeResut as OpCodeResult, ZWIFT_PLAY_UUID } from "./consts.js";
import { InteruptableTask, TaskState } from "../../utils/task.js";
import { BlePeripheral } from "../base/peripheral.js";
import { Sport } from "../../types/sport.js";


const BLE_COMMAND_TIMEOUT = 800;  // ms

export default class BleFitnessMachineDevice extends TBleSensor {
    static readonly profile: LegacyProfile = 'Smart Trainer'
    static readonly protocol: BleProtocol = 'fm'
    static readonly services =  [FTMS];
    static readonly characteristics =  [ '2acc', INDOOR_BIKE_DATA, '2ad6', '2ad8', FTMS_CP, FTMS_STATUS ];
    static readonly detectionPriority:number = 100;

    protected data!: IndoorBikeData
    protected _features: IndoorBikeFeatures|undefined = undefined
    protected hasControl: boolean = false
    protected isCheckingControl: boolean = false;
    protected isCPSubscribed: boolean = false;

    protected crr: number = 0.0033;
    protected cw: number = 0.6;
    protected windSpeed = 0;
    protected wheelSize = 2100;
    protected ftmsServiceData!: FtmsServiceData

    constructor (peripheral:IBlePeripheral, props?:any) {
        super(peripheral,props)

        this.reset()
        
    }

    public get features(): IndoorBikeFeatures {
        return this._features!
    }
    reset() {
        this.data = {}
    
    }

    protected getRequiredCharacteristics():Array<string> {

        this.parseServiceData()
        if (this.ftmsServiceData?.rower)
            return [ROWER_DATA,'2a37',FTMS_STATUS ]
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
                case ROWER_DATA:    //  name: 'Indoor Bike Data',
                    res = this.parseRowerData(data)
                    break;
                case TREADMILL_DATA:
                    res = this.parseTreadmillData(data)
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
        catch(err:any) {
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

    getSupportedSports():Array<Sport> {
        this.parseServiceData()

        if (!this.ftmsServiceData)
            return ['cycling']

        const sports:Array<Sport> = []
        if (this.ftmsServiceData?.indoorBike)
            sports.push('cycling')
        if (this.ftmsServiceData?.rower)
            sports.push('rowing')
        if (this.ftmsServiceData?.treadmill)
            sports.push('running')

        return sports
    }

    protected onDisconnect(): void {
        this.hasControl = false
    }

    async requestControl(): Promise<boolean> {

        if (this.hasControl) {
            return true;
        }

        if (!this.isSubscribed())
            return false

        // If we know from features flag that setPower and setSlope are not supported, just ignore
        if (this.features?.setPower===false && this.features?.setSlope===false && this.features?.setResistance===false) {
            return true;
        }

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
        if (!this.isSubscribed())
            return false


        this.logEvent( {message:'setTargetPower', device:this.getName(),power, skip:(this.data.targetPower!==undefined && this.data.targetPower===power)})

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

    async setTargetResistanceLevel( resistanceLevel: number): Promise<boolean> {

        if (!this.isSubscribed())
            return false

        this.logEvent( {message:'setTargetResistanceLevel', device:this.getName(), resistanceLevel, skip:(this.data.resistanceLevel!==undefined && this.data.resistanceLevel===resistanceLevel)})

        // avoid repeating the same value
        if (this.data.resistanceLevel!==undefined && this.data.resistanceLevel===resistanceLevel)
            return true;

        const hasControl = await this.requestControl(); 
        if (!hasControl) {
            this.logEvent({message: 'setTargetResistanceLevel failed',reason:'control is disabled'})
            return true;
        }
        
   
        const data = Buffer.alloc(3)
        data.writeUInt8(OpCode.SetTargetResistance,0)
        let resistance = Math.min(resistanceLevel, 100);
        resistance = Math.max(resistance, 0);
        data.writeInt16LE( Math.round(resistance*10), 1)

        const res = await this.writeFtmsMessage( OpCode.SetTargetResistance, data ) 
        if (res === OpCodeResult.ControlNotPermitted) {
            this.hasControl = false
        }
        return ( res===OpCodeResult.Success)
    }

    async setSlope(slope:number) {
        if (!this.isSubscribed())
            return false

        this.logEvent( {message:'setSlope',  device:this.getName(), slope})

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
        catch (err:any) { 
            this.logEvent({message:'error',fn:'parseHrm()',error:err.message|err, stack:err.stack})

        }
        return { ...this.data, raw:`2a37:${data.toString('hex')}`};
    }

    protected parseTreadmillData(_data: Uint8Array):IndoorBikeData {
        const data: Buffer = Buffer.from(_data);
        let offset = 2;

        if (data.length > 2) {
            try {
                const flags = data.readUInt16LE(0);

                // Bit 0: More Data — when NOT set, instantaneous speed is present
                if ((flags & 0x0001) === 0) {
                    this.data.speed = data.readUInt16LE(offset) / 100; offset += 2;
                }
                if (flags & 0x0002) { // Average Speed
                    this.data.averageSpeed = data.readUInt16LE(offset) / 100; offset += 2;
                }
                if (flags & 0x0004) { // Total Distance (uint24)
                    const dvLow  = data.readUInt8(offset); offset += 1;
                    const dvHigh = data.readUInt16LE(offset); offset += 2;
                    this.data.totalDistance = (dvHigh << 8) + dvLow;
                }
                if (flags & 0x0008) { // Inclination + Ramp Angle Setting
                    this.data.targetInclination = data.readInt16LE(offset) / 10; offset += 2;
                    offset += 2; // ramp angle (int16) — no matching field in IndoorBikeData
                }
                if (flags & 0x0010) { // Positive + Negative Elevation Gain
                    offset += 2; // positive elevation gain (uint16) — no matching field
                    offset += 2; // negative elevation gain (uint16) — no matching field
                }
                if (flags & 0x0020) { // Instantaneous Pace (min/km, uint8) → speed (km/h)
                    const pace = data.readUInt8(offset); offset += 1;
                    this.data.speed = pace > 0 ? Math.round(60 / pace * 100) / 100 : 0;
                }
                if (flags & 0x0040) { // Average Pace (min/km, uint8) → averageSpeed (km/h)
                    const avgPace = data.readUInt8(offset); offset += 1;
                    this.data.averageSpeed = avgPace > 0 ? Math.round(60 / avgPace * 100) / 100 : 0;
                }
                if (flags & 0x0080) { // Expended Energy
                    this.data.totalEnergy     = data.readUInt16LE(offset); offset += 2;
                    this.data.energyPerHour   = data.readUInt16LE(offset); offset += 2;
                    this.data.energyPerMinute = data.readUInt8(offset);    offset += 1;
                }
                if (flags & 0x0100) { // Heart Rate
                    this.data.heartrate = data.readUInt8(offset); offset += 1;
                }
                if (flags & 0x0200) { // Metabolic Equivalent
                    this.data.metabolicEquivalent = data.readUInt8(offset) / 10; offset += 1;
                }
                if (flags & 0x0400) { // Elapsed Time
                    this.data.time = data.readUInt16LE(offset); offset += 2;
                }
                if (flags & 0x0800) { // Remaining Time
                    this.data.remainingTime = data.readUInt16LE(offset);
                }
                // Bit 12: Force on Belt + Power Output — no matching fields in IndoorBikeData
            }
            catch (err: any) {
                this.logEvent({ message: 'error', fn: 'parseTreadmillData()', device: this.getName(), data: data.toString('hex'), offset, error: err.message, stack: err.stack });
            }
        }

        return { ...this.data, raw: `2acd:${data.toString('hex')}` };
    }

    protected parseRowerData(_data: Uint8Array):IndoorBikeData {
        const data: Buffer = Buffer.from(_data);
        let offset = 2;

        if (data.length > 2) {
            try {
                const flags = data.readUInt16LE(0);

                // Bit 0: More Data — when NOT set, stroke rate + stroke count are present
                if ((flags & 0x0001) === 0) {
                    this.data.cadence = data.readUInt8(offset) / 2; offset += 1;
                    offset += 2; // stroke count (uint16) — no matching field in IndoorBikeData
                }
                if (flags & 0x0002) { // Average Stroke Rate
                    this.data.averageCadence = data.readUInt8(offset) / 2; offset += 1;
                }
                if (flags & 0x0004) { // Total Distance (uint24)
                    const dvLow  = data.readUInt8(offset); offset += 1;
                    const dvHigh = data.readUInt16LE(offset); offset += 2;
                    this.data.totalDistance = (dvHigh << 8) + dvLow;
                }
                if (flags & 0x0008) { // Instantaneous Pace (s/500m) → speed (km/h)
                    const pace = data.readUInt16LE(offset); offset += 2;
                    this.data.speed = pace > 0 ? Math.round(1800 / pace * 100) / 100 : 0;
                }
                if (flags & 0x0010) { // Average Pace (s/500m) → average speed (km/h)
                    const avgPace = data.readUInt16LE(offset); offset += 2;
                    this.data.averageSpeed = avgPace > 0 ? Math.round(1800 / avgPace * 100) / 100 : 0;
                }
                if (flags & 0x0020) { // Instantaneous Power
                    this.data.instantaneousPower = data.readInt16LE(offset); offset += 2;
                }
                if (flags & 0x0040) { // Average Power
                    this.data.averagePower = data.readInt16LE(offset); offset += 2;

                    // also overwrite the instantaneousPower. This seems to be the power at the point of measurement
                    // and this varies a lot during a rowing stroke
                    this.data.instantaneousPower = data.readInt16LE(offset); offset += 2;
                }
                if (flags & 0x0080) { // Resistance Level
                    this.data.resistanceLevel = data.readInt16LE(offset); offset += 2;
                }
                if (flags & 0x0100) { // Expended Energy
                    this.data.totalEnergy    = data.readUInt16LE(offset); offset += 2;
                    this.data.energyPerHour  = data.readUInt16LE(offset); offset += 2;
                    this.data.energyPerMinute = data.readUInt8(offset);   offset += 1;
                }
                if (flags & 0x0200) { // Heart Rate
                    this.data.heartrate = data.readUInt8(offset); offset += 1;
                }
                if (flags & 0x0400) { // Metabolic Equivalent
                    this.data.metabolicEquivalent = data.readUInt8(offset) / 10; offset += 1;
                }
                if (flags & 0x0800) { // Elapsed Time
                    this.data.time = data.readUInt16LE(offset); offset += 2;
                }
                if (flags & 0x1000) { // Remaining Time
                    this.data.remainingTime = data.readUInt16LE(offset);
                }
            }
            catch (err: any) {
                this.logEvent({ message: 'error', fn: 'parseRowerData()', device: this.getName(), data: data.toString('hex'), offset, error: err.message, stack: err.stack });
            }
        }

        return { ...this.data, raw: `2ad1:${data.toString('hex')}` };
    }

    protected parseIndoorBikeData(_data: Uint8Array):IndoorBikeData { 
        const data:Buffer = Buffer.from(_data);
        let offset = 2 ;      

        if (data.length>2) {

            try {
                const flags = data.readUInt16LE(0)
        
                if ((flags & IndoorBikeDataFlag.MoreData)===0 ) {
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
                    this.data.metabolicEquivalent = data.readUInt8(offset)/10; offset+=1;
                }
                if (flags & IndoorBikeDataFlag.ElapsedTimePresent) {
                    this.data.time = data.readUInt16LE(offset); offset+=2;
                }
                if (flags & IndoorBikeDataFlag.RemainingTimePresent) {
                    this.data.remainingTime = data.readUInt16LE(offset); 
                }
        
            }
            catch(err:any) {
                this.logEvent({message:'error',fn:'parseIndoorBikeData()', device:this.getName(), data:data.toString('hex'),offset, error:err.message, stack:err.stack})
            }
        }

        return { ...this.data, raw:`2ad2:${data.toString('hex')}`};

    }

    protected parseFitnessMachineStatus(_data: Uint8Array):IndoorBikeData {  
        const data:Buffer = Buffer.from(_data);
        try {
            const OpCode = data.readUInt8(0);
            switch(OpCode) {
                case FitnessMachineStatusOpCode.TargetPowerChanged:
                    if (data.length>=3)
                        this.data.targetPower = data.readInt16LE(1);
                    else 
                        this.logEvent({message:'warning',fn:'parseFitnessMachineStatus()', warning:'invalid message - message too short',data:data.toString('hex')})                        
                    break;
                case FitnessMachineStatusOpCode.TargetInclineChanged:
                    if (data.length>=3)
                        this.data.targetInclination = data.readInt16LE(1)/10;
                    else 
                        this.logEvent({message:'warning',fn:'parseFitnessMachineStatus()', warning:'invalid message - message too short',data:data.toString('hex')})                        
                    break;
                case FitnessMachineStatusOpCode.FitnessMachineStartedOrResumed:
                    this.data.status = "STARTED"
                    break;
                case FitnessMachineStatusOpCode.FitnessMachineStoppedBySafetyKey:
                case FitnessMachineStatusOpCode.FitnessMachineStoppedOrPaused:
                    this.data.status = "STOPPED"
                    break;
                case FitnessMachineStatusOpCode.SpinDownStatus:
                    if (data.length>=2)
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
                    else  {
                        this.logEvent({message:'warning',fn:'parseFitnessMachineStatus()', warning:'invalid message - message too short',data:data.toString('hex')})                        
                    }
                    break;
                }
    
        }
        catch(err:any) {
            this.logEvent({message:'error',fn:'parseFitnessMachineStatus()', error:err.message,device:this.getName(), data:data.toString('hex'), stack:err.stack})
        }

        return { ...this.data, raw:`2ada:${data.toString('hex')}`};
    }

    protected parseServiceData():FtmsServiceData|undefined {
        if (this.ftmsServiceData)
            return this.ftmsServiceData

        try {
            const peripheral = this.peripheral as BlePeripheral
            if (!peripheral.getServiceData)
                return


            const bitSet = ( value:number, bitNo:number) => (value & bit(bitNo))>0

            const data = peripheral.getServiceData(FTMS)
            const dataLength = data?.length??0
            if (dataLength>=2) {
                const flags = data!.readUInt8(0)
                const fmType = dataLength===3 ? data!.readUInt16LE(1) : data!.readUInt8(1)

                const available = bitSet(flags,0)

                const treadmill     = bitSet(fmType,0)
                const crossTrainer  = bitSet(fmType,1)
                const stepClimber   = bitSet(fmType,2)
                const stairClimber  = bitSet(fmType,3)
                const rower         = bitSet(fmType,4)
                const indoorBike    = bitSet(fmType,5)

                const raw = data?.toString('hex')!
                const serviceData: FtmsServiceData = {available, treadmill, crossTrainer, stepClimber,stairClimber,rower,indoorBike, raw}
                this.logEvent( {message:'service data',device:this.getName(),...serviceData})
                this.ftmsServiceData = serviceData
                return serviceData
                
            }
            else {
                this.logEvent({message:'could not parse service data', reason:'not enough data', raw:data?.toString('hex')})
            }
        }
        catch(err:any) {
            this.logEvent({message:'could not parse service data', reason:err.message, stack:err.stack})
        }
    }
    
    async getFitnessMachineFeatures():Promise<IndoorBikeFeatures|undefined> {

    
        if (this._features)
            return this._features;

        if (this.getName().startsWith('MRK-')) {
            return {fitnessMachine:0, targetSettings:0, setPower:true,power:true, heartrate:true}
        }
        
        try {
            const data = await this.read('2acc')  // Fitness Machine Feature
            const buffer = data ? Buffer.from(data) : undefined


            const services = this.peripheral?.services || []
            let power = services.some( s => matches(s.uuid,'1818'))  // Cycling Power
            let heartrate = services.some( s => matches(s.uuid,'180d'))  // Heart Rate
            const dataLength = buffer?.length??0
            if (dataLength>=8) {
                const fitnessMachine = buffer!.readUInt32LE(0)
                const targetSettings = buffer!.readUInt32LE(4)
                power = power || (fitnessMachine & FitnessMachineFeatureFlag.PowerMeasurementSupported) !== 0
                heartrate = heartrate || (fitnessMachine & FitnessMachineFeatureFlag.HeartRateMeasurementSupported) !==0
                const cadence = (fitnessMachine & FitnessMachineFeatureFlag.CadenceSupported)!==0

                const setSlope = (targetSettings & TargetSettingFeatureFlag.IndoorBikeSimulationParametersSupported)!==0  
                                || (targetSettings & TargetSettingFeatureFlag.InclinationTargetSettingSupported)!==0  

                const setPower = (targetSettings & TargetSettingFeatureFlag.PowerTargetSettingSupported)!==0  
                const setResistance = (targetSettings & TargetSettingFeatureFlag.ResistanceTargetSettingSupported)!==0

                const fmInfo = this.buildFitnessMachineInfo(fitnessMachine) ?? []
                const tsInfo = this.buildTargetSettingsInfo(targetSettings) ?? []

                this._features = {fitnessMachine, targetSettings,power, heartrate, cadence, setPower, setSlope, setResistance}

                this.logEvent( {message:'supported features',device:this.getName(),fmFeatures: fmInfo.join('|'), tsFeatures: tsInfo.join('|'), features:this._features })
                this._features.fmInfo = fmInfo
                this._features.tsInfo = tsInfo

                return this._features
            }
            else {
                return {fitnessMachine:0, targetSettings:0, power, heartrate}
            }
            
    
        }
        catch(err:any) {
            this.logEvent({message:'could not read FitnessMachineFeatures', error:err.message, stack: err.stack,device:this.getName()})
            return undefined
        }

        
    }

    supportsVirtualShifting(): boolean {
        return this.getSupportedServiceUUids()?.some( s=> matches(s,ZWIFT_PLAY_UUID))
    }


    protected buildFitnessMachineInfo(fitnessMachine:number):string[]|undefined { 
        if (this.getName().startsWith('MRK-')) {
            return ['avgSpeed', 'cadence','power', 'pace']
        }

        const info:Array<string> = [];

        const check = (flag:number, name:string):void => {
            if (fitnessMachine & flag) 
                info.push(name);
        }

        try {
            check( FitnessMachineFeatureFlag.AverageSpeedSupported, 'avgSpeed');
            check( FitnessMachineFeatureFlag.CadenceSupported, 'cadence');
            check( FitnessMachineFeatureFlag.TotalDistanceSupported, 'totalDistance');
            check( FitnessMachineFeatureFlag.InclinationSupported, 'inclination');
            check( FitnessMachineFeatureFlag.ElevationGainSupported, 'elevationGain');
            check( FitnessMachineFeatureFlag.PaceSupported, 'pace');
            check( FitnessMachineFeatureFlag.StepCountSupported, 'stepCount');
            check( FitnessMachineFeatureFlag.ResistanceLevelSupported, 'resistanceLevel');
            check( FitnessMachineFeatureFlag.StrideCountSupported, 'strideCount');
            check( FitnessMachineFeatureFlag.ExpendedEnergySupported, 'expendedEnergy') ;
            check( FitnessMachineFeatureFlag.HeartRateMeasurementSupported, 'heartrate');
            check( FitnessMachineFeatureFlag.MetabolicEquivalentSupported, 'metabolicEquivalent');
            check( FitnessMachineFeatureFlag.ElapsedTimeSupported, 'elapsedTime');
            check( FitnessMachineFeatureFlag.RemainingTimeSupported, 'remainingTime');
            check( FitnessMachineFeatureFlag.PowerMeasurementSupported, 'power');
            check( FitnessMachineFeatureFlag.ForceOnBeltAndPowerOutputSupported, 'force');
            check( FitnessMachineFeatureFlag.UserDataRetentionSupported, 'userDataRetention');
        }
        catch(err:any) {
            this.logEvent({message:'could not read FitnessMachineInfo', error:err.message, stack: err.stack,device:this.getName()})
            return undefined
        }
        return info;
    }


    protected buildTargetSettingsInfo(targetSettings:number):string[]|undefined { 
        const info:Array<string> = [];

        const check = (flag:number, name:string):void => {
            if (targetSettings & flag) 
                info.push(name);
        }

        try {
            check( TargetSettingFeatureFlag.SpeedTargetSettingSupported, 'speed');
            check( TargetSettingFeatureFlag.InclinationTargetSettingSupported, 'inclination');
            check( TargetSettingFeatureFlag.ResistanceTargetSettingSupported, 'resistance');
            check( TargetSettingFeatureFlag.PowerTargetSettingSupported, 'power');
            check( TargetSettingFeatureFlag.HeartRateTargetSettingSupported, 'heartrate');
            check( TargetSettingFeatureFlag.TargetedExpendedEnergyConfigurationSupported, 'expendedEnergy');
            check( TargetSettingFeatureFlag.TargetedStepNumberConfigurationSupported, 'steps');
            check( TargetSettingFeatureFlag.TargetedStrideNumberConfigurationSupported, 'strides');
            check( TargetSettingFeatureFlag.TargetedDistanceConfigurationSupported, 'distance');
            check( TargetSettingFeatureFlag.TargetedTrainingTimeConfigurationSupported, 'trainingTime');
            check( TargetSettingFeatureFlag.TargetedTimeInTwoHeartRateZonesConfigurationSupported, 'timeInTwoHRZones');     
            check( TargetSettingFeatureFlag.TargetedTimeInThreeHeartRateZonesConfigurationSupported, 'timeInThreeHRZones');     
            check( TargetSettingFeatureFlag.TargetedTimeInFiveHeartRateZonesConfigurationSupported, 'timeInFiveHRZones');     
            check( TargetSettingFeatureFlag.IndoorBikeSimulationParametersSupported, 'SIM');     
            check( TargetSettingFeatureFlag.WheelCircumferenceConfigurationSupported, 'wheelCircumference');     
            check( TargetSettingFeatureFlag.SpinDownControlSupported, 'spindown');     
            check( TargetSettingFeatureFlag.TargetedCadenceConfigurationSupported, 'cadence');

            if (this.supportsVirtualShifting()) {
                info.push('virtualShifting')
            }
        }
        catch(err:any) {
            this.logEvent({message:'could not read TargetSettingsInfo', error:err.message, stack: err.stack,device:this.getName()})
            return undefined
        }
        return info;
    }




    protected async writeFtmsMessage(requestedOpCode:number, data:Buffer, props?:BleWriteProps) {
        
        try {
            this.logEvent({message:'fmts:write', device:this.getName(), data:data.toString('hex')})
            let res:Buffer
            let tsStart  = Date.now()
            if (props?.timeout) {
                res = await new InteruptableTask<TaskState,Buffer>(
                    this.write( FTMS_CP, data, props ),
                    {
                        timeout: props.timeout??800,
                        errorOnTimeout: true
                    }
                ).run()
            }
            else {
                res = await this.write( FTMS_CP, data, props )
            }
            const responseData = Buffer.from(res)

            const opCode = responseData.readUInt8(0)
            const request = responseData.readUInt8(1)
            const result = responseData.readUInt8(2)

            if (opCode !== OpCode.ResponseCode || request!==requestedOpCode)
                throw new Error('Illegal response ')

            const duration = Date.now() - tsStart
            this.logEvent({message:'fmts:write result', device:this.getName(), res:responseData.toString('hex'),result, duration})

            return result
        }
        catch(err:any) {
            this.logEvent({message:'fmts:write failed', device:this.getName(), opCode: requestedOpCode, reason: err.message})
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

        this.logEvent( {message:'setTargetInclination', device:this.getName(), inclination})
        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'setTargetInclination failed',reason:'control is disabled'})
            return false;
        }
    
        const data = Buffer.alloc(3)
        data.writeUInt8(OpCode.SetTargetInclination,0)
        data.writeInt16LE( Math.round(inclination*10), 1)

        const res = await this.writeFtmsMessage( OpCode.SetTargetInclination, data, {timeout:BLE_COMMAND_TIMEOUT} )
        return ( res===OpCodeResult.Success)    
    }


    async setIndoorBikeSimulation( windSpeed:number, gradient:number, crr:number, cw:number): Promise<boolean> {


        // If we know from features flag that setPower is not supported, just ignore
        if (this.features?.setPower===false)
            return true;

        this.logEvent( {message:'setIndoorBikeSimulation', device:this.getName(), windSpeed, gradient, crr, cw})
        const hasControl = await this.requestControl(); 
        if (!hasControl) {
            this.logEvent({message: 'setIndoorBikeSimulation failed', device:this.getName(), reason:'control is disabled'})
            return false;
        }
    
    
        const data = Buffer.alloc(7)
        data.writeUInt8(OpCode.SetIndoorBikeSimulation,0)
        data.writeInt16LE( Math.round(windSpeed*1000), 1)
        data.writeInt16LE( Math.round(gradient*100), 3)
        data.writeUInt8( Math.round(crr*10000), 5)
        data.writeUInt8( Math.round(cw*100), 6)

        const res = await this.writeFtmsMessage( OpCode.SetIndoorBikeSimulation, data, {timeout:BLE_COMMAND_TIMEOUT} )
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

    protected getName(): string {
        return this.peripheral?.getInfo().name ?? 'ble-fm-device';
    }

}
