import BleInterface from './ble-interface';
import BleProtocol from './incyclist-protocol';
import { BleDeviceClass } from './ble';
import DeviceAdapter, { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from '../Device';
import {EventLogger} from 'gd-eventlog';
import BleFitnessMachineDevice, { FmAdapter } from './fm';

const WAHOO_ADVANCED_FTMS =  'a026e005' 
const WAHOO_ADVANCED_TRAINER_CP =  'a026e037'

const cwABike = {
    race: 0.35,
    triathlon:0.29,
    mountain: 0.57
}
const cRR = 0.0036;					// http://www.radpanther.de/index.php?id=85  -- Conti GP 4000 RS

const enum OpCode   {
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

    targetPower?: number;
    targetInclination?: number;
    status?: string;
}


type CrankData = {
    revolutions?: number,
    time?: number,
    cntUpdateMissing?: number,
}

const ErgWriteDelay = 2000 //ms

export default class WahooAdvancedFitnessMachineDevice extends BleFitnessMachineDevice {
    static services =  ['a026ee0b'];
    static characteristics =  [ '2acc', '2ad2', '2ad6', '2ad8', '2ad9', '2ada', WAHOO_ADVANCED_FTMS, WAHOO_ADVANCED_TRAINER_CP];

    prevCrankData: CrankData = undefined
    currentCrankData: CrankData = undefined
    timeOffset: number = 0
    tsPrevWrite = undefined;  
    
    constructor (props?) {
        super(props)
        this.data = {}
    }

    async init(): Promise<boolean> {
        try {
            this.logEvent({message: 'get device info'})
            await super.init();
            this.logEvent({message: 'device info', deviceInfo:this.deviceInfo, features:this.features })
            
        }
        catch (err) {
            return Promise.resolve(false)
        }
    }


    getProfile(): string {
        return 'Wahoo Smart Trainer';
    }

    getServiceUUids(): string[] {
        return WahooAdvancedFitnessMachineDevice.services;
    }

    isBike(): boolean {
        return true;
    }

    isPower(): boolean {
        return true;
    }

    isHrm(): boolean {
        return this.hasService('180d');
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
                data.readUInt16LE(offset);
                offset+=2;
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



    onData(characteristic:string,data: Buffer) {       
        super.onData(characteristic,data);

        const uuid = characteristic.toLocaleLowerCase();

        let res = undefined
        switch(uuid) {
            case '2a63': 
                res = this.parsePower(data)
                break;
            case '2ad2':    //  name: 'Indoor Bike Data',
                res = this.parseIndoorBikeData(data)
                break;
            case '2a37':     //  name: 'Heart Rate Measurement',
                res = this.parseHrm(data)
                break;
            case '2ada':     //  name: 'Fitness Machine Status',
                res = this.parseFitnessMachineStatus(data)
                break;
            default:    // ignore
                break;

        }
        if (res)
            this.emit('data', res)

 
    }

    async writeWahooFtmsMessage(requestedOpCode:number, data:Buffer) {
        
        try {

            const opcode = Buffer.alloc(1)
            opcode.writeUInt8(requestedOpCode,0)
            const message = Buffer.concat( [opcode,data])
            const res = await this.write( WAHOO_ADVANCED_FTMS, message )

            const responseData = Buffer.from(res)

            const result = responseData.readUInt8(0)
            //const opCode = responseData.readUInt8(1)
            this.logEvent( {message: 'response',opCode: requestedOpCode, response:responseData.toString('hex') })
            return result===1;

            
        }
        catch(err) {
            this.logEvent({message:'writeWahooFtmsMessage failed', opCode: requestedOpCode, reason: err.message})
            return false
        } 
    }

    async requestControl(): Promise<boolean> {
        if (this.hasControl)
            return true;

        this.logEvent( {message:'requestControl'})
        const data = Buffer.alloc(2)
        data.writeUInt8(0xEE,0)
        data.writeUInt8(0xFC,1)

        const res = await this.writeWahooFtmsMessage(OpCode.unlock, data )
        if (res===true) {
            this.hasControl = true
        }
        else {
            this.logEvent( {message:'requestControl failed'})
        }

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
        if (this.isPowerAdjusting())
            return false;
        
        const data = Buffer.alloc(2)
        data.writeInt16LE( Math.round(power), 0)
        
        const res = await this.writeWahooFtmsMessage(OpCode.setErgMode, data )
        if (res===true) {
            this.setPowerAdjusting();
            this.data.targetPower = power;
        }

        return res;            
    }

    async setSimMode( weight:number, crr: number, cw:number):Promise<boolean> {        
        const data = Buffer.alloc(6)
        data.writeInt16LE( Math.round(weight*100), 0)
        data.writeInt16LE( Math.round(crr*10000), 2)
        data.writeInt16LE( Math.round(cw*1000), 4)
        
        const res = await this.writeWahooFtmsMessage(OpCode.setSimMode, data )
        return res;            
    }

    async setSimCRR( crr: number):Promise<boolean> {        
        const data = Buffer.alloc(2)
        data.writeInt16LE( Math.round(crr*10000), 0)
        
        const res = await this.writeWahooFtmsMessage(OpCode.setSimCRR, data )
        return res;            
    }

    async setSimWindResistance( cw: number):Promise<boolean> {        
        const data = Buffer.alloc(2)
        data.writeInt16LE( Math.round(cw*1000), 0)
        
        const res = await this.writeWahooFtmsMessage(OpCode.setSimWindResistance, data )
        return res;            
    }

    async setSimGrade( slope: number):Promise<boolean> {        
        const value = (Math.min(1, Math.max(-1, slope)) + 1.0) * 65535 / 2.0

        const data = Buffer.alloc(2)
        data.writeInt16LE( Math.round(value), 0)
        
        const res = await this.writeWahooFtmsMessage(OpCode.setSimGrade, data )
        return res;            
    }

    async setSimWindSpeed( v: number):Promise<boolean> {         // m/s 

        const value = (Math.max(-32.767, Math.min(32.767, v)) + 32.767) * 1000

        const data = Buffer.alloc(2)
        data.writeInt16LE( Math.round(value), 0)
        
        const res = await this.writeWahooFtmsMessage(OpCode.setSimWindSpeed, data )
        return res;            
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
        const {windSpeed,crr, cw} = this;
        return await this.setIndoorBikeSimulation( windSpeed, slope, crr, cw)
    }


    reset() {
        this.data = {}
    
    }

}
BleInterface.register('WahooAdvancedFitnessMachineDevice','wahoo-fm', WahooAdvancedFitnessMachineDevice,WahooAdvancedFitnessMachineDevice.services)

export class WahooAdvancedFmAdapter extends FmAdapter {

    
    device: WahooAdvancedFitnessMachineDevice;

    constructor( device: BleDeviceClass, protocol: BleProtocol) {
        super(device,protocol);
        this.device = device as WahooAdvancedFitnessMachineDevice;
        this.ble = protocol.ble
        this.cyclingMode = this.getDefaultCyclingMode()
        this.logger = new EventLogger('BLE-WahooFM')

        if (this.device)
            this.device.setLogger(this.logger)
        
    }

    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof WahooAdvancedFmAdapter))
            return false;
        const adapter = device as WahooAdvancedFmAdapter;
        return  (adapter.getName()===this.getName() && adapter.getProfile()===this.getProfile())
    }

   
    getProfile() {
        return 'Wahoo Smart Trainer';
    }


    async start( props?: any ): Promise<any> {
        this.logger.logEvent({message: 'start requested', profile:this.getProfile(),props})



        if ( this.ble.isScanning())
            await this.ble.stopScan();
            
        try {
            const bleDevice = await this.ble.connectDevice(this.device) as WahooAdvancedFitnessMachineDevice
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
                const {user} = props || {}
                const weight = (user && user.weight ? user.weight : DEFAULT_USER_WEIGHT) +  DEFAULT_BIKE_WEIGHT;
                this.device.setSimMode(weight, this.device.getCrr(), this.device.getCw())

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


    pause(): Promise<boolean> { this.paused = true; return Promise.resolve(true)}
    resume(): Promise<boolean> { this.paused = false; return Promise.resolve(true)}
}

