import { LegacyProfile } from "../../antv2/types";
import { CSC_MEASUREMENT, CSP_MEASUREMENT, FTMS_STATUS, INDOOR_BIKE_DATA } from "../consts";
import { TACX_FE_C_BLE, TACX_FE_C_RX, TACX_FE_C_TX , SYNC_BYTE, ANTMessages, DEFAULT_CHANNEL, ACKNOWLEDGED_DATA } from "./consts";
import { CrankData } from "../cp";
import { IndoorBikeData } from "../fm";
import BleFitnessMachineDevice from "../fm/sensor";
import { BleProtocol } from "../types";
import { beautifyUUID, matches } from "../utils";
import { BleFeBikeData, FECState } from "./types";

export default class TacxAdvancedFitnessMachineDevice extends BleFitnessMachineDevice {
    static readonly profile: LegacyProfile = 'Smart Trainer'
    static readonly protocol: BleProtocol = 'tacx'
    static readonly services =  [TACX_FE_C_BLE];
    static readonly characteristics =  [ '2acc', '2ad2', '2ad6', '2ad8', '2ad9', '2ada', TACX_FE_C_RX, TACX_FE_C_TX];
    static readonly detectionPriority = 10;

    protected prevCrankData: CrankData = undefined
    protected currentCrankData: CrankData = undefined
    protected timeOffset: number = 0
    protected tsPrevWrite = undefined;  
    protected data: BleFeBikeData;
    protected hasFECData: boolean
    protected messageCnt: number
    protected currentState:FECState

    protected tacxRx: string;
    protected tacxTx: string
    protected prevMessages: Record<string, {ts:number, message:string}> = {}

    constructor (peripheral, props?) {
        super(peripheral,props)
        this.data = {}
        this.hasFECData = false;
        this.messageCnt = 0;
        this.tacxRx = TACX_FE_C_RX;
        this.tacxTx = TACX_FE_C_TX
    }

    reset() {
        this.data = {}
    
    }
    protected getRequiredCharacteristics():Array<string> {
        return [INDOOR_BIKE_DATA,'2a37',FTMS_STATUS,CSP_MEASUREMENT,CSC_MEASUREMENT,this.tacxRx ]
    }

    onData(characteristic:string,characteristicData: Buffer):boolean {     

        // ensure it's a Buffer
        const data = Buffer.from(characteristicData)

        const isDuplicate = this.isDuplicate(characteristic,data)
        if (isDuplicate) {
            return false;
        }

        this.messageCnt++;
        try {
           

            const uuid = beautifyUUID( characteristic).toLowerCase();
    
            let res = undefined
            if (uuid && matches(uuid,this.tacxRx)) {
                res = this.parseFECMessage(data)
            }
            else {
                switch(uuid) {
                    case CSP_MEASUREMENT:                         
                        res = this.parsePower(data,this.hasFECData )                        
                        break;

                    case INDOOR_BIKE_DATA:                        
                        res = this.parseIndoorBikeData(data,this.hasFECData)
                        break;
                    case '2a37':     //  name: 'Heart Rate Measurement',
                        res = this.parseHrm(data)
                        break;
                    case CSC_MEASUREMENT:                        
                        res = this.parseCSC(data,this.hasFECData)
                        break;
                    case FTMS_STATUS:     //  name: 'Fitness Machine Status',
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
            this.logEvent({message:'error',fn:'tacx.onData()',error:err.message||err, stack:err.stack, dataType: typeof(characteristicData),characteristicData})
        }
 
    }

    protected isDuplicate(characteristic: string, data: Buffer): boolean {
        const uuid = beautifyUUID(characteristic);
        const message = data.toString('hex')

        const prev = this.prevMessages[uuid];
        if (prev?.message===message && Date.now()-prev?.ts<1000) {
            return true
        }

        this.prevMessages[uuid] = {ts:Date.now(), message}
        return false;
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



    async requestControl(): Promise<boolean> {
        return true;
    }

    protected parseCrankData(crankData) {
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
        else if ( p.cntUpdateMissing<0 || p.cntUpdateMissing>2) {
                rpm = 0;            
        }
        const cntUpdateMissing = p.cntUpdateMissing;
        this.prevCrankData = this.currentCrankData
        if ( hasUpdate)  
            this.prevCrankData.cntUpdateMissing = 0;
        else 
            this.prevCrankData.cntUpdateMissing = cntUpdateMissing+1;

        return {rpm, time:this.timeOffset+c.time }
    }

    protected parseCSC( _data:Buffer,logOnly:boolean=false):IndoorBikeData {
        const data:Buffer = Buffer.from(_data);
        this.logEvent({message:'BLE CSC message',data:data.toString('hex')});
        if(logOnly)
            return this.data

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
        }


        return this.data;
    }

    protected parsePower( _data:Buffer,logOnly:boolean=false):IndoorBikeData {
        const data:Buffer = Buffer.from(_data);
        this.logEvent({message:'BLE CSP message',data:data.toString('hex')});
        if (logOnly)
            return this.data;

        try {
            let offset = 4;
            const flags = data.readUInt16LE(0)

            this.data.instantaneousPower = data.readUInt16LE(2)
            
            if ( flags&0x1)  // bit 0
                data.readUInt8(offset++);   // pedal power balance

            if ( flags&0x4)  {              // Accumulated Torque
                offset+=2;
            }
            if (flags&0x10) {               // Wheel revolution
                offset+=6;
            }
            if ( flags&0x20)  {             // crank revolution
                const crankData = { 
                    revolutions: data.readUInt16LE(offset),
                    time: data.readUInt16LE(offset+2)
                }
                const {rpm,time} = this.parseCrankData(crankData)                
                this.data.cadence = rpm;
                this.data.time = time;
            }
            
        }
        catch (err) { 
            this.logEvent( {message:'error',fn:'parsePower()',error:err.message||err, stack:err.stack})
        }
        const {instantaneousPower, cadence,time} = this.data
        return {instantaneousPower, cadence,time,raw:data.toString('hex')}

    }

    protected parseIndoorBikeData(_data: Buffer, logOnly?: boolean): IndoorBikeData {
        this.logEvent({message:'BLE INDOOR_BIKE_DATA message',data:_data.toString('hex')});
        if (logOnly)
            return this.data;

        return super.parseIndoorBikeData(_data)
        
    }

    protected resetState() {
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

    protected parseFEState(capStateBF:number) {
        switch ((capStateBF & 0x70) >> 4) {
            case 1: this.data.State = 'OFF'; break;
            case 2: 
                this.data.State = 'READY'; 
                if (this.currentState!=='READY')
                    this.resetState(); 
                break;
            case 3: this.data.State = 'IN_USE'; break;
            case 4: this.data.State = 'FINISHED'; break;
            default: delete this.data.State; break;
        }
        if (capStateBF & 0x80) {
            // lap
        }
        this.currentState = this.data.State

    }

    protected parseGeneralFE(data:Buffer):BleFeBikeData {
        const equipmentTypeBF = data.readUInt8(1);
        let elapsedTime = data.readUInt8(2);
        let distance = data.readUInt8(3);
        const speed = data.readUInt16LE(4);
        const heartRate = data.readUInt8(6);
        const capStateBF = data.readUInt8(7);

        this.parseFEEquipmentType(equipmentTypeBF);
        this.parseFEHeartrate(heartRate, capStateBF);
        this.parseFETime(elapsedTime);
        this.parseFEDistance(capStateBF, distance);
        this.data.speed = speed/1000;
        this.parseFERealSpeed(capStateBF, speed);
        this.parseFEState(capStateBF);

        return this.data;

    } 

    private parseFEEquipmentType(equipmentTypeBF: number) {
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
    }


    private parseFEHeartrate(heartRate: number, capStateBF: number) {
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
    }

    private parseFETime(elapsedTime: number) {
        elapsedTime /= 4;
        const oldElapsedTime = (this.data.time || 0) % 64;
        if (elapsedTime !== oldElapsedTime) {
            if (oldElapsedTime > elapsedTime) { //Hit rollover value
                elapsedTime += 64;
            }
        }
        this.data.time = (this.data.time || 0) + elapsedTime - oldElapsedTime;        
    }

    private parseFEDistance(capStateBF: number, distance: number) {
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
    }

    private parseFERealSpeed(capStateBF: number, speed: number) {
        if (capStateBF & 0x08) {
            this.data.VirtualSpeed = speed / 1000;
            delete this.data.RealSpeed;
        } else {
            delete this.data.VirtualSpeed;
            this.data.RealSpeed = speed / 1000;
        }
    }


    protected parseTrainerData(data:Buffer):BleFeBikeData {

        //const data = Buffer.from(buffer)
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

    protected parseProductInformation(data:Buffer):BleFeBikeData {
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


    protected parseFECMessage( data:Buffer):BleFeBikeData {
        

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
                    res = this.parseGeneralFE( Buffer.from(data.subarray(4,len+3)) )
                    break;
                case ANTMessages.trainerData:
                    res = this.parseTrainerData( Buffer.from(data.subarray(4,len+3)) )
                    break;
                case ANTMessages.productInformation:
                    res = this.parseProductInformation( Buffer.from(data.subarray(4,len+3)))
                    break;
        
            }
            if (res)
                res.raw = data.toString('hex')
    
        }
        catch (err) {
            this.logEvent( {message:'error',fn:'parseFECMessage()',error:err.message||err, stack:err.stack,dataType:typeof(data)})
        }
        return res;
    }

    
    protected getChecksum(message: any[]): number {
		let checksum = 0;
		message.forEach((byte) => {
			checksum = (checksum ^ byte) % 0xFF;
		});
		return checksum;
	}

    protected buildMessage(payload: number[] = [], msgID = 0x00): Buffer {
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

    protected async sendMessage(message:Buffer):Promise<boolean> {
        this.logEvent({message:'write',characteristic: this.tacxTx,data:message.toString('hex')})

        try {
            await this.write( this.tacxTx, message, {withoutResponse:true} )
            return true
        }
        catch(err) {
            this.logEvent({message:'write failed',characteristic: this.tacxTx, reason:err.message})
            return false;
        }
        
    }

    async sendUserConfiguration (userWeight, bikeWeight, wheelDiameter, gearRatio):Promise<boolean> {

        const logStr = `sendUserConfiguration(${userWeight},${bikeWeight},${wheelDiameter},${gearRatio})`
        this.logEvent( {message:logStr})

        let m = userWeight===undefined ? 0xFFFF : userWeight;
        let mb = bikeWeight===undefined ? 0xFFF: bikeWeight;
        let d = wheelDiameter===undefined ? 0xFF : wheelDiameter;
        let gr = gearRatio===undefined ? 0x00 : gearRatio;
        let dOffset = 0xFF;

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

        const payload = [];
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

        let res = resistance===undefined ?  0 : resistance;            
        res = res / 0.5;

        const payload = [];
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

        let p = power===undefined ?  0x00 : power;
        p = p * 4;

        const payload = [];
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

        let wc = windCoeff===undefined ? 0xFF : windCoeff;
        let ws = windSpeed===undefined ? 0xFF : windSpeed;
        let df = draftFactor===undefined ? 0xFF : draftFactor;

        if (wc!==0xFF) {
            wc = Math.trunc(wc/0.01);
        }
        if (ws!==0xFF) {
            ws = Math.trunc(ws+127);
        }
        if (df!==0xFF) {
            df = Math.trunc(df/0.01);
        }

        const payload = [];
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

        let s  = slope===undefined ?  0xFFFF : slope;
        let rr = rrCoeff===undefined ? 0xFF : rrCoeff;

        if (s!==0xFFFF) {
            s = Math.trunc((s+200)/0.01);
        }
        if (rr!==0xFF) {
            rr = Math.trunc(rr/0.00005);
        }

        const payload = [];
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




}
