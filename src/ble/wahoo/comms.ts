import { BleWahooComms } from ".";
import { LegacyProfile } from "../../antv2/types";
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../../base/consts";
import { CSP, CSP_MEASUREMENT, FTMS_CP, FTMS_STATUS, HR_MEASUREMENT, INDOOR_BIKE_DATA, WAHOO_ADVANCED_TRAINER_CP, WAHOO_ADVANCED_TRAINER_CP_FULL } from "../consts";
import { CrankData } from "../cp";
import { IndoorBikeData } from "../fm";
import BleFitnessMachineDevice from "../fm/comms";
import { BleProtocol, BleWriteProps, IBlePeripheralConnector } from "../types";
import { matches, uuid } from "../utils";

export const enum OpCode   {
    unlock                     = 32,
    setResistanceMode          = 64,
    setStandardMode            = 65,
    setErgMode                 = 66,
    setSimMode                 = 67,
    setSimCRR                  = 68,
    setSimWindResistance       = 69,
    setSimGrade                = 70,
    setSimWindSpeed            = 71,
    setWheelCircumference      = 72
}


const ErgWriteDelay = 2000 //ms

export default class BleWahooDevice extends BleFitnessMachineDevice {
    static protocol: BleProtocol = 'wahoo'
    static services =  [CSP];
    static characteristics =  [ '2acc', '2ad2', '2ad6', '2ad8', '2ad9', '2ada', WAHOO_ADVANCED_TRAINER_CP];
    static detectionPriority = 5;

    prevCrankData: CrankData = undefined
    currentCrankData: CrankData = undefined
    timeOffset: number = 0
    tsPrevWrite = undefined;  
    prevSlope = undefined;
    wahooCP:string;
    isSimMode: boolean;
    isRequestControlBusy: boolean = false;
    weight: number = DEFAULT_BIKE_WEIGHT+DEFAULT_USER_WEIGHT;

    simModeSettings: { 
        weight:number, 
        crr: number,
        cw: number
    }
    
    constructor (props?) {
        super(props)
        this.data = {}
        this.wahooCP = WAHOO_ADVANCED_TRAINER_CP;
    }

    static isMatching(characteristics: string[]): boolean {
        if (!characteristics)
            return false;

        const announced = characteristics.map( c=> uuid(c))

        const hasWahooCP = announced.find( c => matches(c,WAHOO_ADVANCED_TRAINER_CP))!==undefined 
        const hasFTMS = announced.find( c => matches(c,FTMS_CP))!==undefined 

        return   hasWahooCP && !hasFTMS;
    }

    async init(): Promise<boolean> {
        try {
            await this.subscribeWriteResponse(this.wahooCP);         
            try {
                if ( this.wahooCP!==WAHOO_ADVANCED_TRAINER_CP_FULL.toLowerCase())
                    await this.subscribeWriteResponse(WAHOO_ADVANCED_TRAINER_CP_FULL.toLowerCase())
            }
            catch(err) {

            }

            return await super.initDevice();
            
            
        }
        catch (err) {
            this.logEvent( {message:'error',fn:'WahooAdvancedFitnessMachineDevice.init()',error:err.message||err, stack:err.stack})
            return false;
        }
    }

    setCharacteristicUUIDs(uuids: string[]): void {

        this.logEvent({message:'set uuids',uuids})
        uuids.forEach( c => {
            if (matches(c,WAHOO_ADVANCED_TRAINER_CP))
                this.wahooCP = c;
        })
    }


    getProfile(): LegacyProfile {
        return 'Smart Trainer';
    }

    getProtocol(): BleProtocol {
        return BleWahooComms.protocol
    }

    getServiceUUids(): string[] {
        return BleWahooDevice.services;
    }

    parseCrankData(crankData) {
        if (!this.prevCrankData) this.prevCrankData= {revolutions:0,time:0, cntUpdateMissing:-1}

        const c = this.currentCrankData = crankData
        const p = this.prevCrankData;
        let rpm = this.data.cadence;
        
        let hasUpdate = c.time!==p.time;

        if ( hasUpdate) { 
            let time = c.time - p.time //+ c.time<p.time ? 0x10000: 0
            let revs = c.revolutions - p.revolutions //+ c.revolutions<p.revolutions ? 0x10000: 0

            if (c.time<p.time) {
                 time+=0x10000;
                 this.timeOffset+=0x10000;
                 
            }

            if (c.revolutions<p.revolutions) revs+=0x10000;
            
            rpm = 1024*60*revs/time
        }
        else {
            if ( p.cntUpdateMissing<0 || p.cntUpdateMissing>2) {
                rpm = 0;
            }
        }
        const cntUpdateMissing = p.cntUpdateMissing;
        this.prevCrankData = this.currentCrankData
        if ( hasUpdate)  
            this.prevCrankData.cntUpdateMissing = 0;
        else 
            this.prevCrankData.cntUpdateMissing = cntUpdateMissing+1;

        return {rpm, time:this.timeOffset+c.time }
    }

    parsePower( _data:Buffer):IndoorBikeData {
        const data:Buffer = Buffer.from(_data);
        try {
            let offset = 4;
            const flags = data.readUInt16LE(0)

            this.data.instantaneousPower = data.readUInt16LE(2)
            
            if ( flags&0x1)  
                data.readUInt8(offset++);
            if ( flags&0x4)  {
                offset+=2;
            }
            if ( flags&0x10)  {
                offset+=6;
            }
            if ( flags&0x20)  {
                const crankData = { 
                    revolutions: data.readUInt16LE(offset),
                    time: data.readUInt16LE(offset+2)
                }
                const {rpm,time} = this.parseCrankData(crankData)                
                this.data.cadence = rpm;
                this.data.time = time;
                offset+=4
            }
            
        }
        catch (err) { 

        }
        const {instantaneousPower, cadence,time} = this.data
        return {instantaneousPower, cadence,time,raw:data.toString('hex')}

    }



    onData(characteristic:string,data: Buffer):boolean {       
        const hasData = super.onData(characteristic,data);
        if (!hasData)
            return false;

        const uuid = characteristic.toLowerCase();

        let res = undefined
        switch(uuid) {
            case CSP_MEASUREMENT: 
                res = this.parsePower(data)
                break;
            case INDOOR_BIKE_DATA:    //  name: 'Indoor Bike Data',
                res = this.parseIndoorBikeData(data)
                break;
            case HR_MEASUREMENT:     //  name: 'Heart Rate Measurement',
                res = this.parseHrm(data)
                break;
            case FTMS_STATUS:     //  name: 'Fitness Machine Status',
                res = this.parseFitnessMachineStatus(data)
                break;
            default:    // ignore
                this.logEvent({message:'data',uuid,data:data.toString('hex')})
                break;

        }
        if (res) {
            this.emit('data', res)
            return false;
        }
        return true;
 
    }


    subscribeAll(conn?: IBlePeripheralConnector):Promise<void> {
        return  this.subscribeMultiple( [ CSP_MEASUREMENT, INDOOR_BIKE_DATA, HR_MEASUREMENT, FTMS_STATUS, this.wahooCP ], conn)
    }    



    async writeWahooFtmsMessage(requestedOpCode:number, data:Buffer,props?:BleWriteProps) {
        
        try {

            const opcode = Buffer.alloc(1)
            opcode.writeUInt8(requestedOpCode,0)
            const message = Buffer.concat( [opcode,data])
            this.logEvent({message:'wahoo cp:write', data:message.toString('hex')})
           
            const res = await this.write( this.wahooCP, message,props )


            const responseData = Buffer.from(res)
            const result = responseData.readUInt8(0)
            //const opCode = responseData.readUInt8(1)
            return result===1;

            
        }
        catch(err) {
            this.logEvent({message:'wahoo cp:write failed', opCode: requestedOpCode, reason: err.message})
            return false
        } 
    }

    async requestControl(): Promise<boolean> {
        if (this.hasControl)
            return true;
        this.logEvent( {message:'requestControl'})

        if (this.isRequestControlBusy)
            return false;

        this.isRequestControlBusy = true;
        try 
        { 

            const data = Buffer.alloc(2)
            data.writeUInt8(0xEE,0)
            data.writeUInt8(0xFC,1)
    
            const res = await this.writeWahooFtmsMessage(OpCode.unlock, data, {timeout:10000} )
            if (res===true) {
                this.hasControl = true
            }
            else {
                this.logEvent( {message:'requestControl failed'})
            }
    
        }
        catch(err) {
            this.logEvent({message:'error', fn:'requestControl()', error:err.message||err, stack:err.stack})
        }
        this.isRequestControlBusy = false;

        return this.hasControl;
    }

    // Wahoo has a minimum interval between ERG writes to the trainer to give it time to react and apply a new setting.
    setPowerAdjusting() {
        this.tsPrevWrite = Date.now();
    }

    isPowerAdjusting(): boolean  {
        if (this.tsPrevWrite===undefined)
            return false;
        if (this.tsPrevWrite< Date.now()-ErgWriteDelay) {
            this.tsPrevWrite=undefined
            return false;
        }
        return true;
    }


    async setErgMode( power:number):Promise<boolean> {
        this.logger.logEvent( {message:'setErgMode',power})     

        try {
            if (this.isPowerAdjusting())
                return false;

            const data = Buffer.alloc(2)
            data.writeInt16LE( Math.round(power), 0)
            
            const res = await this.writeWahooFtmsMessage(OpCode.setErgMode, data )
            if (res===true) {
                this.setPowerAdjusting();
                this.data.targetPower = power;
                this.isSimMode = false;
                this.simModeSettings = undefined;
            }

            return res;            
        }
        catch(err) {
            this.logEvent({message:'error',fn:'setErgMode', error:err.message||err, stack:err.stack})
            return false;
        }
    }

    async setSimMode( weight:number, crr: number, cw:number):Promise<boolean> {   
        this.logger.logEvent( {message:'setSimMode',weight,crr,cw})     

        try {
            
            if (this.isSimMode && this.simModeSettings) {
                if ( weight===this.simModeSettings.weight &&
                     crr === this.simModeSettings.crr && 
                     cw === this.simModeSettings.cw)
                     return true;
            }
            const hasControl = await this.requestControl(); 
            if (!hasControl) {
                this.logEvent({message: 'setSimMode failed',reason:'control is disabled'})
                return false;
            }
            
            this.weight = weight;
            this.crr = crr;
            this.cw = cw;

            const data = Buffer.alloc(6)
            data.writeInt16LE( Math.round(weight*100), 0)
            data.writeInt16LE( Math.round(crr*10000), 2)
            data.writeInt16LE( Math.round(cw*1000), 4)
            
            const res = await this.writeWahooFtmsMessage(OpCode.setSimMode, data )

            this.isSimMode = true;
            this.simModeSettings={weight,crr,cw}
            return res;            
        }
        catch(err) {
            this.logEvent({message:'error',fn:'setSimMode', error:err.message||err, stack:err.stack})
            return false;
        }
    }

    async setSimCRR( crr: number):Promise<boolean> {        
        this.logger.logEvent( {message:'setSimCRR',crr})     

        try {
            const data = Buffer.alloc(2)
            data.writeInt16LE( Math.round(crr*10000), 0)
            
            const res = await this.writeWahooFtmsMessage(OpCode.setSimCRR, data )
            return res;            
        }
        catch(err) {
            this.logEvent({message:'error',fn:'setSimCRR', error:err.message||err, stack:err.stack})
            return false;
        }

    }

    async setSimWindResistance( cw: number):Promise<boolean> {        
        this.logger.logEvent( {message:'setSimWindResistance',cw})     
        
        try {
            const data = Buffer.alloc(2)
            data.writeInt16LE( Math.round(cw*1000), 0)
            
            const res = await this.writeWahooFtmsMessage(OpCode.setSimWindResistance, data )
            return res;            
        }
        catch(err) {
            this.logEvent({message:'error',fn:'setSimWindResistance', error:err.message||err, stack:err.stack})
            return false;
        }

    }

    async setSimGrade( slope: number):Promise<boolean> {  
        this.logger.logEvent( {message:'setSimGrade',slope})                 
        try {

            let s = slope;
            if (s<-100) s=-100;
            if (s>100) s=100


            const slopeVal = Math.min( Math.round((1+s/100)*65535/2.0)  , 65535)

            const data = Buffer.alloc(2)
            data.writeUInt16LE( slopeVal, 0)

            const res = await this.writeWahooFtmsMessage(OpCode.setSimGrade, data )
            return res;            
        }
        catch(err) {
            this.logEvent({message:'error',fn:'setSimGrade', error:err.message||err, stack:err.stack})
            return false;
        }

    }

    async setSimWindSpeed( v: number):Promise<boolean> {         // m/s 
        this.logger.logEvent( {message:'setSimWindSpeed',v})     
        try {
            const value = (Math.max(-32.767, Math.min(32.767, v)) + 32.767) * 1000

            const data = Buffer.alloc(2)
            data.writeInt16LE( Math.round(value), 0)
            
            const res = await this.writeWahooFtmsMessage(OpCode.setSimWindSpeed, data )
            return res;            
        }
        catch(err) {
            this.logEvent({message:'error',fn:'setSimWindSpeed', error:err.message||err, stack:err.stack})
            return false;
        }

    }


    async setTargetPower( power: number): Promise<boolean> {
        this.logEvent( {message:'setTargetPower', power, skip:(this.data.targetPower!==undefined && this.data.targetPower===power)})

        // avoid repeating the same value
        if (this.data.targetPower!==undefined && this.data.targetPower===power)
            return true;

        const hasControl = await this.requestControl(); 
        if (!hasControl) {
            this.logEvent({message: 'setTargetPower failed',reason:'control is disabled'})
            return false;
        }
        
        return await this.setErgMode(power)        
    }

    async setSlope(slope) {

        this.logEvent( {message:'setSlope', slope})

        if (this.prevSlope!==undefined && slope===this.prevSlope)
            return;

        try {
            if (!this.isSimMode) {
                const {weight,crr, cw} = this;

                const hasSimMode = await this.setSimMode(weight,crr,cw)
                if (!hasSimMode)
                    throw new Error( 'Sim Mode not enabled')
            }
    
            const res = await this.setSimGrade( slope)
            this.logEvent( {message:'setSlope result', res})
            this.prevSlope = slope;
            return res;
        }
        catch( err) {
            this.logEvent( {message:'setSlope failed',reason:err.message||err})
            this.prevSlope = undefined;
            return false;
        }
        
    }


    reset() {
        this.data = {}
        this.isSimMode = undefined;
        this.simModeSettings = undefined
    
    }

}
