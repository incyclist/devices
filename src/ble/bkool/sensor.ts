import { LegacyProfile } from "../../antv2/types.js";
import { CSP, CSP_MEASUREMENT } from "../consts.js";
import { BKOOL_SERVICE, BKOOL_CONTROL, BKOOL_FRAME_MARKER, FECPage } from './consts.js'
import { CrankData } from "../cp/index.js";
import { IndoorBikeData } from "../fm/index.js";
import BleFitnessMachineDevice from "../fm/sensor.js";
import { BleProtocol, IBlePeripheral } from "../types.js";
import { beautifyUUID } from "../utils.js";

export default class BleBkoolDevice extends BleFitnessMachineDevice {
    static readonly profile: LegacyProfile = 'Smart Trainer'
    static readonly protocol: BleProtocol = 'bkool'
    static readonly services =  [CSP, BKOOL_SERVICE];
    static readonly characteristics =  [CSP_MEASUREMENT, BKOOL_CONTROL];
    static readonly detectionPriority = 5;

    prevCrankData: CrankData = undefined
    currentCrankData: CrankData = undefined
    timeOffset: number = 0

    constructor (peripheral: IBlePeripheral, props?: any) {
        super(peripheral, props)
        this.data = {}
        this._features = {
            fitnessMachine: 0, targetSettings: 0,
            power: true, cadence: true, heartrate: this.supportsHeartRate(),
            setPower: true, setSlope: true, setResistance: true
        }
    }

    isMatching(serviceUUIDs: string[]): boolean {
        const uuids = serviceUUIDs.map( uuid=>beautifyUUID(uuid))
        return uuids.includes(beautifyUUID(CSP)) && uuids.includes(beautifyUUID(BKOOL_SERVICE));
    }

    reset() {
        this.data = {}
    }

    protected getRequiredCharacteristics():Array<string> {
        return [CSP_MEASUREMENT, BKOOL_CONTROL]
    }

    onData(characteristic:string,characteristicData: Buffer):boolean {
        const data = Buffer.from(characteristicData);
        const uuid = beautifyUUID( characteristic).toLowerCase();

        let res
        switch(uuid) {
            case CSP_MEASUREMENT:
                res = this.parsePower(data)
                break;
            default:    // ignore - includes BKOOL_CONTROL notifications (echo/ack, not parsed)
                this.logEvent({message:'data',uuid,data:Buffer.from(data).toString('hex')})
                break;
        }
        if (res) {
            this.emit('data', res)
            return false;
        }
        return true;
    }

    // Bkool's protocol has no RequestControl handshake - it's bare FE-C data pages written
    // straight to BKOOL_CONTROL, with no permission/unlock negotiation anywhere in bkoolbike.cpp.
    // Mirrors Tacx's own sensor (ble/tacx/sensor.ts), which has the same property.
    async requestControl(): Promise<boolean> {
        return true;
    }

    async setTargetPower( power: number): Promise<boolean> {
        this.logEvent( {message:'setTargetPower', power, skip:(this.data.targetPower!==undefined && this.data.targetPower===power)})

        if (this.data.targetPower!==undefined && this.data.targetPower===power)
            return true;

        const res = await this.sendTargetPower(power)
        if (res)
            this.data.targetPower = power
        return res
    }

    async setSlope(slope: number): Promise<boolean> {
        this.logEvent( {message:'setSlope', slope})

        if (this.data.targetInclination!==undefined && this.data.targetInclination===slope)
            return true;

        const res = await this.sendTrackResistance(slope, this.crr)
        if (res)
            this.data.targetInclination = slope
        return res
    }

    // This hardware has no concept of a discrete resistance level - qdomyos-zwift's own handling for
    // this device converts a requested resistance into an inclination (it never issues a separate
    // "resistance" FE-C write for Bkool - that code path is dead/commented out in bkoolbike.cpp).
    // The /10 factor mirrors QZ's own conversion exactly.
    async setTargetResistanceLevel( resistanceLevel: number): Promise<boolean> {
        return await this.setSlope(resistanceLevel/10)
    }

    // --- FE-C page builders - bare 8-byte frames, no ANT envelope. Same field layouts as the
    // standard ANT+ FE-C pages (and as ../tacx/sensor.ts's identically-named methods), reverse
    // verified byte-for-byte against a live capture of qdomyos-zwift's actual init-sequence writes
    // against a simulated device (see design repo features/bkool-smartpro-trainer-support): every
    // one of QZ's hardcoded init bytes decodes exactly under these formulas with ordinary values
    // (0% resistance, 0.30 wind coefficient, 0% slope, and - for sendUserConfiguration - this
    // library's own DEFAULT_USER_WEIGHT/DEFAULT_BIKE_WEIGHT, a 700c wheel, 1:1 gear ratio).

    async sendBasicResistance(resistance?: number): Promise<boolean> {
        const res = resistance===undefined ? 0xFF : Math.round(resistance/0.5) & 0xFF
        const frame = [FECPage.basicResistance, BKOOL_FRAME_MARKER, 0xff, 0xff, 0xff, 0xff, 0xff, res]
        return await this.sendFrame(frame)
    }

    async sendTargetPower(power?: number): Promise<boolean> {
        const p = power===undefined ? 0xFFFF : Math.round(power*4) & 0xFFFF
        const frame = [FECPage.targetPower, BKOOL_FRAME_MARKER, 0xff, 0xff, 0xff, 0xff, p&0xFF, (p>>8)&0xFF]
        return await this.sendFrame(frame)
    }

    async sendWindResistance(windCoeff?: number, windSpeed?: number, draftFactor?: number): Promise<boolean> {
        const wc = windCoeff===undefined ? 0xFF : Math.round(windCoeff/0.01) & 0xFF
        const ws = windSpeed===undefined ? 0xFF : Math.round(windSpeed+127) & 0xFF
        const df = draftFactor===undefined ? 0xFF : Math.round(draftFactor/0.01) & 0xFF
        const frame = [FECPage.windResistance, BKOOL_FRAME_MARKER, 0xff, 0xff, 0xff, wc, ws, df]
        return await this.sendFrame(frame)
    }

    async sendTrackResistance(slope?: number, rrCoeff?: number): Promise<boolean> {
        const s = slope===undefined ? 0xFFFF : Math.round((slope+200)*100) & 0xFFFF
        const rr = rrCoeff===undefined ? 0xFF : Math.round(rrCoeff/0.00005) & 0xFF
        const frame = [FECPage.trackResistance, BKOOL_FRAME_MARKER, 0xff, 0xff, 0xff, s&0xFF, (s>>8)&0xFF, rr]
        return await this.sendFrame(frame)
    }

    // Page 0x37 User Configuration - the one page in this family that does NOT use
    // BKOOL_FRAME_MARKER at byte 1; that position (and byte 2) carry the actual user-weight
    // payload instead. Field layout identical to Tacx's sendUserConfiguration().
    async sendUserConfiguration(userWeight?: number, bikeWeight?: number, wheelDiameter?: number, gearRatio?: number): Promise<boolean> {
        let m = userWeight===undefined ? 0xFFFF : userWeight;
        let mb = bikeWeight===undefined ? 0xFFF: bikeWeight;
        let d = wheelDiameter===undefined ? 0xFF : wheelDiameter;
        let gr = gearRatio===undefined ? 0x00 : gearRatio;
        let dOffset = 0xFF;

        if (m!==0xFFFF)
            m = Math.round(m*100);
        if (mb!==0xFFF)
            mb = Math.round(mb*20);
        if (d!==0xFF) {
            d = d*1000;
            dOffset = d%10;
            d = Math.trunc(d/10);
        }
        if (gr!==0x00) {
            gr = Math.round(gr/0.03);
        }

        const frame = [
            FECPage.userConfiguration,
            m&0xFF, (m>>8)&0xFF,
            0xff,
            ((mb&0xF)<<4)|(dOffset&0xF), (mb>>4)&0xFF,
            d&0xFF,
            gr&0xFF
        ]
        return await this.sendFrame(frame)
    }

    protected async sendFrame(frame: number[]): Promise<boolean> {
        const data = Buffer.from(frame)
        this.logEvent({message:'bkool:write', data:data.toString('hex')})

        try {
            await this.write( BKOOL_CONTROL, data, {withoutResponse:true} )
            return true
        }
        catch(err:any) {
            this.logEvent({message:'bkool:write failed', reason:err.message})
            return false;
        }
    }

    protected parseCrankData(crankData: CrankData) {
        if (!this.prevCrankData) this.prevCrankData= {revolutions:0,time:0, cntUpdateMissing:-1}

        const c = this.currentCrankData = crankData
        const p = this.prevCrankData;
        let rpm = this.data.cadence;

        const hasUpdate = c.time!==p.time;

        if ( hasUpdate) {
            let time = c.time - p.time
            let revs = c.revolutions - p.revolutions

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
        this.prevCrankData.cntUpdateMissing = hasUpdate ? 0 : cntUpdateMissing+1;

        return {rpm, time:this.timeOffset+c.time }
    }

    protected parsePower( _data:Buffer):IndoorBikeData {
        const data:Buffer = Buffer.from(_data);

        try {
            let offset = 4;
            const flags = data.readUInt16LE(0)

            this.data.instantaneousPower = data.readUInt16LE(2)

            if ( flags&0x1) offset++                   // pedal power balance - not mapped
            if ( flags&0x4) offset += 2                 // accumulated torque - not mapped
            if ( flags&0x10) offset += 6                // wheel revolution data - not mapped

            if ( flags&0x20)  {
                const crankData = {
                    revolutions: data.readUInt16LE(offset),
                    time: data.readUInt16LE(offset+2)
                }
                const {rpm,time} = this.parseCrankData(crankData)
                this.data.cadence = rpm;
                this.data.time = time;
            }
        }
        catch (err:any) {
            this.logEvent({message:'error', fn:'parsePower', error:err.message, stack:err.stack})
        }
        const {instantaneousPower, cadence, time} = this.data
        return {instantaneousPower, cadence, time, raw:'2a63:'+data.toString('hex')}
    }

    protected supportsHeartRate(): boolean {
        try {
            if (!this.peripheral)
                return false;

            return this.peripheral.services?.find( s=> beautifyUUID(s.uuid)===beautifyUUID('180d'))!==undefined
        }
        catch(err:any) {
            this.logEvent({message:'error', fn:'supportsHeartRate', error:err.message, stack:err.stack})
            return false;
        }
    }

    // Bkool devices (CSP + Bkool-proprietary control service only) never expose real FTMS, so the
    // inherited BleFitnessMachineDevice implementations of these would always try an FTMS
    // characteristic, fail (characteristic not found) and log a guaranteed, spurious failure on
    // every single pairing. Control already happens through BKOOL_CONTROL (setSlope()/
    // setTargetPower()/setTargetResistanceLevel() above), so these are safe, silent no-ops here -
    // same precedent as the Wahoo sensor.

    async startRequest(): Promise<boolean> {
        return true;
    }

    async stopRequest(): Promise<boolean> {
        return true;
    }

    async PauseRequest(): Promise<boolean> {
        return true;
    }

    async setTargetInclination(_inclination: number): Promise<boolean> {
        return true;
    }

    protected getName(): string {
        return this.peripheral?.getInfo().name ?? 'ble-bkool-device';
    }

}
