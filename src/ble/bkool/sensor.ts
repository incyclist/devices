import { LegacyProfile } from "../../antv2/types.js";
import { CSP, CSP_MEASUREMENT } from "../consts.js";
import { BKOOL_SERVICE, BKOOL_CONTROL, FECPage, INIT_BASIC_RESISTANCE, INIT_WIND_RESISTANCE, INIT_TRACK_RESISTANCE, INIT_USER_CONFIG_1, INIT_USER_CONFIG_2 } from './consts.js'
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
    isInitialized: boolean = false

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
        this.isInitialized = false
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
    // straight to BKOOL_CONTROL. qdomyos-zwift instead sends a fixed 5-frame init sequence (basic
    // resistance / wind resistance / track resistance / user config x2) the first time it talks to
    // a device, before any dynamic power/slope write - confirmed byte-for-byte via a live capture
    // of QZ's actual writes against a simulated device (see design repo
    // features/bkool-smartpro-trainer-support). Mirrored here, once per connection, gating the
    // first dynamic write the same way requestControl() gates Wahoo/FTMS devices.
    async requestControl(): Promise<boolean> {
        if (this.hasControl)
            return true;

        if (this.isInitialized) {
            this.hasControl = true
            return true;
        }

        this.logEvent({message:'requestControl'})

        try {
            await this.sendFrame(INIT_BASIC_RESISTANCE)
            await this.sendFrame(INIT_WIND_RESISTANCE)
            await this.sendFrame(INIT_TRACK_RESISTANCE)
            await this.sendFrame(INIT_USER_CONFIG_1)
            await this.sendFrame(INIT_USER_CONFIG_2)

            this.isInitialized = true
            this.hasControl = true
        }
        catch(err:any) {
            this.logEvent({message:'error', fn:'requestControl()', error:err.message, stack:err.stack})
        }

        return this.hasControl;
    }

    async setTargetPower( power: number): Promise<boolean> {
        this.logEvent( {message:'setTargetPower', power, skip:(this.data.targetPower!==undefined && this.data.targetPower===power)})

        if (this.data.targetPower!==undefined && this.data.targetPower===power)
            return true;

        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'setTargetPower failed',reason:'control is disabled'})
            return false;
        }

        // FE-C page 0x31 Target Power, quarter-watt resolution, bytes[6..7] LE (bkoolbike.cpp forcePower())
        const quarterWatts = Math.round(power*4) & 0xFFFF
        const frame = [FECPage.targetPower, 0x25, 0xff, 0xff, 0xff, 0xff, quarterWatts&0xFF, (quarterWatts>>8)&0xFF]

        const res = await this.sendFrame(frame)
        if (res)
            this.data.targetPower = power
        return res
    }

    async setSlope(slope: number): Promise<boolean> {
        this.logEvent( {message:'setSlope', slope})

        if (this.data.targetInclination!==undefined && this.data.targetInclination===slope)
            return true;

        const hasControl = await this.requestControl();
        if (!hasControl) {
            this.logEvent({message: 'setSlope failed',reason:'control is disabled'})
            return false;
        }

        // FE-C page 0x33 Track Resistance, raw=(slope+200)*100, bytes[5..6] LE, trailing byte fixed
        // at 0xa0 (bkoolbike.cpp forceInclination() - the drafting-factor byte it never varies)
        const raw = Math.round((slope+200)*100) & 0xFFFF
        const frame = [FECPage.trackResistance, 0x25, 0xff, 0xff, 0xff, raw&0xFF, (raw>>8)&0xFF, 0xa0]

        const res = await this.sendFrame(frame)
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
