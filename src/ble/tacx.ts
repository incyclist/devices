import BleInterface from './ble-interface';
import BleProtocol from './incyclist-protocol';
import { BleDeviceClass } from './ble';
import DeviceAdapter, { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from '../Device';
import {EventLogger} from 'gd-eventlog';
import BleFitnessMachineDevice, { FmAdapter,IndoorBikeData } from './fm';
import {FTMS_CP,TACX_FE_C_BLE,TACX_FE_C_RX,TACX_FE_C_TX} from './consts'

const SYNC_BYTE = 0xA4; //164
const DEFAULT_CHANNEL = 5;
const ACKNOWLEDGED_DATA = 0x4F; //79
const PROFILE_ID = 'Tacx SmartTrainer'

const cwABike = {
    race: 0.35,
    triathlon:0.29,
    mountain: 0.57
}
const cRR = 0.0036;					// http://www.radpanther.de/index.php?id=85  -- Conti GP 4000 RS

enum  ANTMessages {
    calibrationCommand = 1,
    calibrationStatus  = 2,
    generalFE          = 16,
    generalSettings    = 17,
    trainerData        = 25,
    basicResistance    = 48,
    targetPower        = 49,
    windResistance     = 50,
    trackResistance    = 51,
    feCapabilities     = 54,
    userConfiguration  = 55,
    requestData        = 70,
    commandStatus      = 71,
    manufactererData   = 80,
    productInformation = 81
}



interface BleFeBikeData extends IndoorBikeData  {
	EquipmentType?: 'Treadmill' | 'Elliptical' | 'StationaryBike' | 'Rower' | 'Climber' | 'NordicSkier' | 'Trainer' | 'General';
	RealSpeed?: number;
	VirtualSpeed?: number;
	HeartRateSource?: 'HandContact' | 'EM' | 'ANT+';
	State?: 'OFF' | 'READY' | 'IN_USE' | 'FINISHED';

	EventCount?: number;
	AccumulatedPower?: number;
	TrainerStatus?: number;
	TargetStatus?: 'OnTarget' | 'LowSpeed' | 'HighSpeed';

    HwVersion?: number;
	ManId?: number;
	ModelNum?: number;

	SwVersion?: number;
	SerialNumber?: number;
}


type CrankData = {
    revolutions?: number,
    time?: number,
    cntUpdateMissing?: number,
}

type MessageInfo = {
    message: string,
    ts: number,
    uuid: string
}

type MessageLog = {
    [uuid:string]: MessageInfo;
}


export default class TacxAdvancedFitnessMachineDevice extends BleFitnessMachineDevice {
    static services =  [TACX_FE_C_BLE];
    static characteristics =  [ '2acc', '2ad2', '2ad6', '2ad8', '2ad9', '2ada', TACX_FE_C_RX, TACX_FE_C_TX];
    static PROFILE = PROFILE_ID;

    prevCrankData: CrankData = undefined
    currentCrankData: CrankData = undefined
    timeOffset: number = 0
    tsPrevWrite = undefined;  
    data: BleFeBikeData;
    hasFECData: boolean
    prevMessages:  MessageLog;
    messageCnt: number

    constructor (props?) {
        super(props)
        this.data = {}
        this.hasFECData = false;
        this.messageCnt = 0;
        this.prevMessages ={}

    }

    
    isMatching(characteristics: string[]): boolean {
        if (!characteristics)
            return false;

        const hasTacxCP = characteristics.find( c => c===TACX_FE_C_RX)!==undefined  && characteristics.find( c => c===TACX_FE_C_TX)!==undefined
        const hasFTMS = characteristics.find( c => c===FTMS_CP)!==undefined 

        return   hasTacxCP;
    }

    async init(): Promise<boolean> {
        try {
            await super.initDevice();            
            return true;
        }
        catch (err) {
            this.logEvent( {message:'error',fn:'TacxAdvancedFitnessMachineDevice.init()',error:err.message||err, stack:err.stack})                        
            return false;
        }
    }


    getProfile(): string {
        return TacxAdvancedFitnessMachineDevice.PROFILE;
    }

    getServiceUUids(): string[] {
        return TacxAdvancedFitnessMachineDevice.services;
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
    async requestControl(): Promise<boolean> {
        return true;
    }

    parseCrankData(crankData) {
        if (!this.prevCrankData) {
            this.prevCrankData= {...crankData, cntUpdateMissing:-1}
            return {}
        }

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

    parseCSC( _data:Buffer):IndoorBikeData {
        this.logEvent({message:'BLE CSC message',data:_data.toString('hex')});

        const data:Buffer = Buffer.from(_data);
        let offset = 0;

        const flags = data.readUInt8(offset); offset++;
        if (flags & 0x01) {  // wheel revolutions
            offset+=6;
        }
        if (flags & 0x02) {  // crank revolutions
            const crankData = { 
                revolutions: data.readUInt16LE(offset),
                time: data.readUInt16LE(offset+2)
            }
            const {rpm,time} = this.parseCrankData(crankData)                
            this.data.cadence = rpm;
            this.data.time = time;
            offset+=4

        }


        return this.data;
    }

    parsePower( _data:Buffer):IndoorBikeData {
        this.logEvent({message:'BLE CSP message',data:_data.toString('hex')});

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
            this.logEvent( {message:'error',fn:'parsePower()',error:err.message||err, stack:err.stack})
        }
        const {instantaneousPower, cadence,time} = this.data
        return {instantaneousPower, cadence,time,raw:data.toString('hex')}

    }

    resetState() {
        const state = this.data;

        delete state.time;
        delete state.totalDistance;
        delete state.RealSpeed;
        delete state.VirtualSpeed;
        delete state.heartrate;
        delete state.HeartRateSource;
        delete state.EventCount;
        delete state.cadence;
        delete state.AccumulatedPower;
        delete state.instantaneousPower
        delete state.averagePower
        delete state.TrainerStatus;
        delete state.TargetStatus;
    }

    parseFEState(capStateBF:number) {
        switch ((capStateBF & 0x70) >> 4) {
            case 1: this.data.State = 'OFF'; break;
            case 2: this.data.State = 'READY'; this.resetState(); break;
            case 3: this.data.State = 'IN_USE'; break;
            case 4: this.data.State = 'FINISHED'; break;
            default: delete this.data.State; break;
        }
        if (capStateBF & 0x80) {
            // lap
        }

    }

    parseGeneralFE(data:Buffer):BleFeBikeData {
        const equipmentTypeBF = data.readUInt8(1);
        let elapsedTime = data.readUInt8(2);
        let distance = data.readUInt8(3);
        const speed = data.readUInt16LE(4);
        const heartRate = data.readUInt8(6);
        const capStateBF = data.readUInt8(7);

        switch (equipmentTypeBF & 0x1F) {
            case 19: this.data.EquipmentType = 'Treadmill'; break;
            case 20: this.data.EquipmentType = 'Elliptical'; break;
            case 21: this.data.EquipmentType = 'StationaryBike'; break;
            case 22: this.data.EquipmentType = 'Rower'; break;
            case 23: this.data.EquipmentType = 'Climber'; break;
            case 24: this.data.EquipmentType = 'NordicSkier'; break;
            case 25: this.data.EquipmentType = 'Trainer'; break;
            default: this.data.EquipmentType = 'General'; break;
        }

        if (heartRate !== 0xFF) {
            switch (capStateBF & 0x03) {
                case 3: {
                    this.data.heartrate = heartRate;
                    this.data.HeartRateSource = 'HandContact';
                    break;
                }
                case 2: {
                    this.data.heartrate = heartRate;
                    this.data.HeartRateSource = 'EM';
                    break;
                }
                case 1: {
                    this.data.heartrate = heartRate;
                    this.data.HeartRateSource = 'ANT+';
                    break;
                }
                default: {
                    delete this.data.heartrate;
                    delete this.data.HeartRateSource;
                    break;
                }
            }
        }

        elapsedTime /= 4;
        const oldElapsedTime = (this.data.time || 0) % 64;
        if (elapsedTime !== oldElapsedTime) {
            if (oldElapsedTime > elapsedTime) { //Hit rollover value
                elapsedTime += 64;
            }
        }
        this.data.time = (this.data.time || 0) + elapsedTime - oldElapsedTime;

        if (capStateBF & 0x04) {
            const oldDistance = (this.data.time || 0) % 256;
            if (distance !== oldDistance) {
                if (oldDistance > distance) { //Hit rollover value
                    distance += 256;
                }
            }
            this.data.totalDistance = (this.data.totalDistance || 0) + distance - oldDistance;
        } else {
            delete this.data.totalDistance;
        }
        this.data.speed = speed/1000;
        if (capStateBF & 0x08) {
            this.data.VirtualSpeed = speed / 1000;
            delete this.data.RealSpeed;
        } else {
            delete this.data.VirtualSpeed;
            this.data.RealSpeed = speed / 1000;
        }
        this.parseFEState(capStateBF);
        return this.data;

    } 

    parseTrainerData(data:Buffer):BleFeBikeData {
        const oldEventCount = this.data.EventCount || 0;

        let eventCount = data.readUInt8(1);
        const cadence = data.readUInt8(2);
        let accPower = data.readUInt16LE(3);
        const power = data.readUInt16LE(5) & 0xFFF;
        const trainerStatus = data.readUInt8(6) >> 4;
        const flagStateBF = data.readUInt8(7);

        

        if (eventCount !== oldEventCount) {
            this.data.EventCount= eventCount;
            if (oldEventCount > eventCount) { //Hit rollover value
                eventCount += 255;
            }
        }

        if (cadence !== 0xFF) {
            this.data.cadence = cadence
        }

        if (power !== 0xFFF) {
            this.data.instantaneousPower = power;

            const oldAccPower = (this.data.AccumulatedPower || 0) % 65536;
            if (accPower !== oldAccPower) {
                if (oldAccPower > accPower) {
                    accPower += 65536;
                }
            }
            this.data.AccumulatedPower = (this.data.AccumulatedPower || 0) + accPower - oldAccPower;
            this.data.averagePower = (accPower - oldAccPower) / (eventCount - oldEventCount);
        }

        this.data.TrainerStatus = trainerStatus;

        switch (flagStateBF & 0x03) {
            case 0: this.data.TargetStatus = 'OnTarget'; break;
            case 1: this.data.TargetStatus = 'LowSpeed'; break;
            case 2: this.data.TargetStatus = 'HighSpeed'; break;
            default: delete this.data.TargetStatus; break;
        }
        this.parseFEState(flagStateBF);

        if ( power!==undefined && cadence!==undefined )
            this.hasFECData = true;

        return this.data;

    }

    parseProductInformation(data:Buffer):BleFeBikeData {
        const swRevSup = data.readUInt8(2);
        const swRevMain = data.readUInt8(3);
        const serial = data.readInt32LE(4);

        this.data.SwVersion = swRevMain;

        if (swRevSup !== 0xFF) {
            this.data.SwVersion += swRevSup / 1000;
        }

        if (serial !== 0xFFFFFFFF) {
            this.data.SerialNumber = serial;
        }
        return this.data
    }


    parseFECMessage( _data:Buffer):BleFeBikeData {
        const data:Buffer = Buffer.from(_data);

        this.logEvent({message:'FE-C message',data:data.toString('hex')});

        // message format
        // 0            UINT8      SYNC_BYTE
        // 1            UINT8      Message Length  (ml)
        // 2            UNIT8      Message Type ( in most cases 0x4E = Broadcast)
        // 3            UINT8      Channel ( always 5)
        // 4            UINT8      Message-ID 
        // 5...ml+2     (...)      payload
        // ml+3         UINT8      Checksum

        const c = data.readUInt8(0)
        if ( c!== SYNC_BYTE) {
            this.logEvent({message:'SYNC missing',raw:data.toString('hex')})
            return;
        }
        const len = data.readUInt8(1);
        const messageId = data.readUInt8(4);

        let res;
        try {
            switch (messageId) {
                case ANTMessages.generalFE:
                    res = this.parseGeneralFE(data.slice(4,len+3))
                    break;
                case ANTMessages.trainerData:
                    res = this.parseTrainerData(data.slice(4,len+3))
                    break;
                case ANTMessages.productInformation:
                    res = this.parseProductInformation(data.slice(4,len+3))
                    break;
        
            }
            if (res)
                res.raw = data.toString('hex')
    
        }
        catch (err) {
            this.logEvent( {message:'error',fn:'parseFECMessage()',error:err.message||err, stack:err.stack})
        }
        return res;
    }



    onData(characteristic:string,data: Buffer) {     
        try {
           

            const uuid = characteristic.toLocaleLowerCase();
            
            // workaround to avoid duplicate messages
            const message = data.toString('hex')
            const ts = Date.now();
            if (this.prevMessages[uuid]) {
                const prev = this.prevMessages[uuid];
                if (prev.message===message && prev.ts>ts-500) {
                    return;
                }
            }
            this.prevMessages[uuid] = { uuid,ts,message}
            this.messageCnt++;
    
            let res = undefined
            if (uuid && uuid.startsWith(TACX_FE_C_RX)) {
                res = this.parseFECMessage(data)
            }
            else {
                switch(uuid) {
                    case '2a63': 
                        if (!this.hasFECData)
                            res = this.parsePower(data)
                        break;
                    case '2ad2':    //  name: 'Indoor Bike Data',
                        if (!this.hasFECData)
                            res = this.parseIndoorBikeData(data)
                        break;
                    case '2a37':     //  name: 'Heart Rate Measurement',
                        res = this.parseHrm(data)
                        break;
                    case '2a5b':     //  name: 'CSC Measurement',
                        if (!this.hasFECData)
                            res = this.parseCSC(data)
                        break;
                    case '2ada':     //  name: 'Fitness Machine Status',
                        if (!this.hasFECData)
                            res = this.parseFitnessMachineStatus(data)
                        break;
                    default:    // ignore
                        break;
        
                }
        
            }
            
            if (res)
                this.emit('data', res)
            return res;
    
        }  
        catch (err) {
            this.logEvent({message:'error',fn:'tacx.onData()',error:err.message||err, stack:err.stack})
        }
 
    }
    
    getChecksum(message: any[]): number {
		let checksum = 0;
		message.forEach((byte) => {
			checksum = (checksum ^ byte) % 0xFF;
		});
		return checksum;
	}

    buildMessage(payload: number[] = [], msgID = 0x00): Buffer {
		const m: number[] = [];
		m.push(SYNC_BYTE);
		m.push(payload.length);
		m.push(msgID);
		payload.forEach((byte) => {
			m.push(byte);
		});
		m.push(this.getChecksum(m));
		return Buffer.from(m);
	}

    async sendMessage(message:Buffer):Promise<boolean> {
        await this.write( TACX_FE_C_TX, message,true )
        return true;
    }

    async sendUserConfiguration (userWeight, bikeWeight, wheelDiameter, gearRatio):Promise<boolean> {

        const logStr = `sendUserConfiguration(${userWeight},${bikeWeight},${wheelDiameter},${gearRatio})`
        this.logEvent( {message:logStr})

        var m = userWeight===undefined ? 0xFFFF : userWeight;
        var mb = bikeWeight===undefined ? 0xFFF: bikeWeight;
        var d = wheelDiameter===undefined ? 0xFF : wheelDiameter;
        var gr = gearRatio===undefined ? 0x00 : gearRatio;
        var dOffset = 0xFF;

        if (m!==0xFFFF)
            m = Math.trunc(m*100);
        if (mb!==0xFFF)
            mb = Math.trunc(mb*20);        
        if (d!==0xFF) {
            d = d*1000;
            dOffset = d%10;
            d = Math.trunc(d/10);
        }
        if (gr!==0x00) {
            gr= Math.trunc(gr/0.03);
        }

        var payload = [];
        payload.push ( DEFAULT_CHANNEL);
        payload.push (0x37);                        // data page 55: User Configuration
        payload.push (m&0xFF);                      // weight LSB
        payload.push ((m>>8)&0xFF);                 // weight MSB
        payload.push (0xFF);                        // reserved
        payload.push (((mb&0xF)<<4)|(dOffset&0xF)); //  bicycle weight LSN  and 
        payload.push ((mb>>4)&0xF);                 // bicycle weight MSB 
        payload.push (d&0xFF);                      // bicycle wheel diameter 
        payload.push (gr&0xFF);                     // gear ratio 

        const data = this.buildMessage(payload,ACKNOWLEDGED_DATA )
        return await this.sendMessage(data)  
    }

    async sendBasicResistance( resistance):Promise<boolean> {   
        const logStr = `sendBasicResistance(${resistance})`;
        this.logEvent( {message:logStr})

        var res = resistance===undefined ?  0 : resistance;            
        res = res / 0.5;

        var payload = [];
        payload.push (DEFAULT_CHANNEL);
        payload.push (0x30);                        // data page 48: Basic Resistance
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (res&0xFF);                    // resistance 
        const data = this.buildMessage(payload,ACKNOWLEDGED_DATA )
        return await this.sendMessage(data)  
    }

    async sendTargetPower( power):Promise<boolean> {
        const logStr = `sendTargetPower(${power})`;
        this.logEvent( {message:logStr})

        var p = power===undefined ?  0x00 : power;
        p = p * 4;

        var payload = [];
        payload.push (DEFAULT_CHANNEL);
        payload.push (0x31);                        // data page 49: Target Power
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (p&0xFF);                      // power LSB
        payload.push ((p>>8)&0xFF);                 // power MSB 

        const data = this.buildMessage(payload,ACKNOWLEDGED_DATA )
        return await this.sendMessage(data)  

    }

    async sendWindResistance( windCoeff,windSpeed,draftFactor):Promise<boolean> {

        const logStr = `sendWindResistance(${windCoeff},${windSpeed},${draftFactor})`;
        this.logEvent( {message:logStr})

        var wc = windCoeff===undefined ? 0xFF : windCoeff;
        var ws = windSpeed===undefined ? 0xFF : windSpeed;
        var df = draftFactor===undefined ? 0xFF : draftFactor;

        if (wc!==0xFF) {
            wc = Math.trunc(wc/0.01);
        }
        if (ws!==0xFF) {
            ws = Math.trunc(ws+127);
        }
        if (df!==0xFF) {
            df = Math.trunc(df/0.01);
        }

        var payload = [];
        payload.push (DEFAULT_CHANNEL);
        payload.push (0x32);                        // data page 50: Wind Resistance
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (wc&0xFF);                     // Wind Resistance Coefficient
        payload.push (ws&0xFF);                     // Wind Speed
        payload.push (df&0xFF);                     // Drafting Factor

        const data = this.buildMessage(payload,ACKNOWLEDGED_DATA )
        return await this.sendMessage(data)  

    }

    async sendTrackResistance( slope, rrCoeff?): Promise<boolean> {       
        const logStr = `sendTrackResistance(${slope},${rrCoeff})`;
        this.logEvent( {message:logStr})

        var s  = slope===undefined ?  0xFFFF : slope;
        var rr = rrCoeff===undefined ? 0xFF : rrCoeff;

        if (s!==0xFFFF) {
            s = Math.trunc((s+200)/0.01);
        }
        if (rr!==0xFF) {
            rr = Math.trunc(rr/0.00005);
        }

        var payload = [];
        payload.push (DEFAULT_CHANNEL);
        payload.push (0x33);                        // data page 51: Track Resistance 
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (0xFF);                        // reserved
        payload.push (s&0xFF);                      // Grade (Slope) LSB
        payload.push ((s>>8)&0xFF);                 // Grade (Slope) MSB
        payload.push (rr&0xFF);                     // Drafting Factor

        const data = this.buildMessage(payload,ACKNOWLEDGED_DATA )
        return await this.sendMessage(data)  

    }

    async setTargetPower( power: number): Promise<boolean> {
        // avoid repeating the same value
        if (this.data.targetPower!==undefined && this.data.targetPower===power)
            return true;
        
        return await this.sendTargetPower(power)
    }

    async setSlope(slope):Promise<boolean> {
            return await this.sendTrackResistance(slope, this.crr)    
    }


    reset() {
        this.data = {}
    
    }

}
BleInterface.register('TacxBleFEDevice','tacx-ble-fec', TacxAdvancedFitnessMachineDevice,TacxAdvancedFitnessMachineDevice.services)


export class TacxBleFEAdapter extends FmAdapter {

    static PROFILE = PROFILE_ID;
    
    device: TacxAdvancedFitnessMachineDevice;

    constructor( device: BleDeviceClass, protocol: BleProtocol) {
        super(device,protocol);
        this.device = device as TacxAdvancedFitnessMachineDevice;
        this.ble = protocol.ble
        this.cyclingMode = this.getDefaultCyclingMode()
        this.logger = new EventLogger('BLE-FEC-Tacx')

        if (this.device)
            this.device.setLogger(this.logger)
        
    }

    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof TacxBleFEAdapter))
            return false;
        const adapter = device as TacxBleFEAdapter;
        return  (adapter.getName()===this.getName() && adapter.getProfile()===this.getProfile())
    }

   
    getProfile() {
        return TacxBleFEAdapter.PROFILE;
    }


    async start( props?: any ): Promise<any> {
        this.logger.logEvent({message: 'start requested', profile:this.getProfile(),props})



        if ( this.ble.isScanning())
            await this.ble.stopScan();
            
        try {
            const bleDevice = await this.ble.connectDevice(this.device) as TacxAdvancedFitnessMachineDevice
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
                
                const {user, wheelDiameter, gearRatio} = props || {}
                const userWeight = (user && user.weight ? user.weight : DEFAULT_USER_WEIGHT);
                const bikeWeight = DEFAULT_BIKE_WEIGHT;

                this.device.sendTrackResistance(0.0);
                this.device.sendUserConfiguration( userWeight, bikeWeight, wheelDiameter, gearRatio);

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

