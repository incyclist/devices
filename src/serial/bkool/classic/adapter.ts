import { EventLogger } from "gd-eventlog";
import { ReadlineParser } from '@serialport/parser-readline'

import { SerialIncyclistDevice } from "../../base/adapter.js";
import SerialInterface from "../../base/serial-interface.js";
import { SerialDeviceSettings } from "../../types.js";
import SmartTrainerCyclingMode from "../../../modes/antble-smarttrainer.js";
import PowerMeterCyclingMode from "../../../modes/power-meter.js";
import { IncyclistBikeData, IncyclistCapability, ControllerConfig, IAdapter, IncyclistAdapterData, DeviceProperties, ITrainer } from "../../../types/index.js";
import { UpdateRequest } from "../../../modes/types.js";
import { Sport } from "../../../types/sport.js";
import { sleep } from "../../../utils/utils.js";

/**
 * Bkool Trainer Classic connected via its USB cable (FTDI serial, 115200 8N1).
 *
 * The trainer streams a text console twice per second:
 *   WIND:0.000000 i:0.000000 CR:0.008000 M:80 DRAFT:1.000000 PHOTOINT:0
 *   CAD:0rpm FREQ:3260rpm SPD(r/v):30.7/ 0.0 Kmh POS:110.2 MOT:102 TEMP:315 TARGET:61.5w MAGNET:54.4w SHOW:137w
 * and accepts text commands "$C<letter><unsigned int>#" (reply "$C<letter>OK#"):
 *   CS slope   (slope % x 100, e.g. $CS500# = 5 %, $CS-300# = -3 %)
 *   CF rolling resistance (crr x 1000, default 8)
 *   CW rider weight in kg
 *   CN wind (km/h x 100)
 * "$PC#" returns "$RL<12 hex id>V<version>#".
 *
 * Reverse engineered from the trainer; not an official Bkool protocol description.
 */

export const PROTOCOL_NAME = 'Bkool Classic'
const BAUD_RATE = 115200
const CHECK_TIMEOUT = 5000
const EMIT_INTERVAL = 1000
const MAX_SLOPE = 25
const DATA_TIMEOUT = 3000
const ROLLING_RESISTANCE = 0.004
// The power the trainer reports (SHOW) reads far below a crank power meter. Fitted against a
// Stages meter (2026-11-20, two rides, 55 min, 30 s averages, both within +-2.5 %):
//   power = 1.35 * SHOW + 16 W, and 2 * SHOW at very low readings so that it goes smoothly to 0.
// An earlier ride (2026-11-19) needed ~10 % more, so expect some day-to-day variation.
export const POWER_GAIN = 1.35
export const POWER_OFFSET = 16
export const calibratePower = (raw: number): number => {
    if (!(raw > 0)) return 0
    return Math.round(Math.min(2 * raw, POWER_GAIN * raw + POWER_OFFSET))
}

const RX_TELEMETRY = /CAD:\s*(\d+)rpm.*SPD\(r\/v\):\s*([-\d.]+)\/\s*([-\d.]+).*SHOW:\s*(-?\d+)w/
const RX_SETTINGS = /WIND:\s*([-\d.]+)\s+i:\s*([-\d.]+)\s+CR:\s*([-\d.]+)\s+M:\s*(\d+)/
const RX_ID = /\$RL([0-9A-F]{12})V?([\d.]+)?#/i

type BkoolClassicData = {
    speed: number       // km/h (real wheel speed)
    power: number       // W (power shown by the trainer)
    cadence: number     // rpm (always 0 on this hardware)
    slope?: number      // % as reported by the trainer
    timestamp: number
}

export default class BkoolClassicAdapter extends SerialIncyclistDevice<DeviceProperties> implements ITrainer {

    protected static controllers: ControllerConfig = {
        modes: [SmartTrainerCyclingMode, PowerMeterCyclingMode],
        default: SmartTrainerCyclingMode
    }

    protected serial: SerialInterface
    protected sp: any
    protected parser: any
    protected opened = false
    protected bkoolData: BkoolClassicData
    protected trainerId: string
    protected trainerVersion: string
    protected iv: NodeJS.Timeout
    protected lastSlopeCmd: number
    protected lastCrrCmd: number
    protected distanceInternal = 0
    protected prevTs: number
    protected waiters: Array<{ match: RegExp, resolve: (m: RegExpMatchArray) => void }> = []

    constructor(settings: SerialDeviceSettings, props?: DeviceProperties) {
        super(settings, props)
        this.logger = new EventLogger('BkoolClassic')
        this.serial = SerialInterface.getInstance({ ifaceName: settings.interface as string ?? 'serial' })
        this.capabilities = [IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Control]
    }

    isBike(): boolean { return true }
    isPower(): boolean { return true }
    isHrm(): boolean { return false }
    getProtocolName(): string { return PROTOCOL_NAME }
    getName(): string { return this.settings.name || PROTOCOL_NAME }
    getSupportedSports(): Array<Sport> { return ['cycling'] }
    getSerialInterface(): SerialInterface { return this.serial }

    isSame(device: IAdapter): boolean {
        if (!(device instanceof BkoolClassicAdapter))
            return false
        return device.getPort() === this.getPort()
    }

    // ---------------------------------------------------------------- serial handling

    async open(): Promise<boolean> {
        if (this.opened && this.sp?.isOpen)
            return true
        try {
            const port = await this.serial.openPort(this.getPort(), { baudRate: BAUD_RATE })
            if (!port) {
                this.logEvent({ message: 'could not open port', port: this.getPort() })
                return false
            }
            this.sp = port
            this.parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
            this.parser.on('data', (line: string) => this.onLine(line))
            port.on('error', (err) => this.logEvent({ message: 'port error', port: this.getPort(), error: err?.message }))
            port.on('close', () => { this.opened = false })
            this.opened = true
            this.logEvent({ message: 'port opened', port: this.getPort(), baudRate: BAUD_RATE })
            return true
        }
        catch (err) {
            this.logEvent({ message: 'open failed', port: this.getPort(), error: err?.message })
            return false
        }
    }

    async close(): Promise<boolean> {
        try {
            this.parser?.removeAllListeners()
            if (this.opened)
                await this.serial.closePort(this.getPort())
        }
        catch (err) {
            this.logEvent({ message: 'close failed', error: err?.message })
        }
        this.opened = false
        this.sp = undefined
        return true
    }

    protected onLine(raw: string) {
        const line = raw.replace(/\0/g, '').trim()
        if (!line)
            return

        for (const w of [...this.waiters]) {
            const m = line.match(w.match)
            if (m) {
                this.waiters.splice(this.waiters.indexOf(w), 1)
                w.resolve(m)
            }
        }

        const t = RX_TELEMETRY.exec(line)
        if (t) {
            this.bkoolData = {
                ...(this.bkoolData ?? {}),
                cadence: Number.parseInt(t[1]),
                speed: Math.max(0, Number.parseFloat(t[2])),
                power: calibratePower(Number.parseInt(t[4])),
                timestamp: Date.now()
            }
            return
        }
        const s = RX_SETTINGS.exec(line)
        if (s) {
            if (this.bkoolData)
                this.bkoolData.slope = Number.parseFloat(s[2]) * 100
            return
        }
        if (line.includes('OK#') || line.startsWith('$'))
            this.logEvent({ message: 'trainer response', line })
    }

    protected waitFor(match: RegExp, timeout: number): Promise<RegExpMatchArray | undefined> {
        return new Promise(resolve => {
            const w = { match, resolve: (m: RegExpMatchArray) => { clearTimeout(to); resolve(m) } }
            const to = setTimeout(() => {
                const idx = this.waiters.indexOf(w)
                if (idx !== -1) this.waiters.splice(idx, 1)
                resolve(undefined)
            }, timeout)
            this.waiters.push(w)
        })
    }

    protected write(cmd: string): Promise<void> {
        return new Promise(resolve => {
            if (!this.sp?.isOpen) {
                this.logEvent({ message: 'write skipped, port not open', cmd })
                resolve()
                return
            }
            this.sp.write(cmd, 'ascii', (err) => {
                if (err) this.logEvent({ message: 'write failed', cmd, error: err.message })
                resolve()
            })
        })
    }

    // ---------------------------------------------------------------- trainer commands

    async sendSlope(slopePct: number) {
        const v = Math.round(Math.max(-MAX_SLOPE, Math.min(slopePct, MAX_SLOPE)) * 100)   // trainer accepts "$CS-300#" for -3 %
        if (v === this.lastSlopeCmd)
            return
        this.lastSlopeCmd = v
        this.logEvent({ message: 'set slope', slope: slopePct, cmd: `$CS${v}#` })
        await this.write(`$CS${v}#`)
    }

    async sendRollingResistance(crr: number) {
        const v = Math.round(Math.max(0.001, Math.min(crr, 0.05)) * 1000)
        if (v === this.lastCrrCmd)
            return
        this.lastCrrCmd = v
        await this.write(`$CF${v}#`)
    }

    async sendDefaults() {
        // the Bkool app sends the total mass (rider + bike), so do the same
        const totalWeight = Math.round(Math.max(30, Math.min(this.getWeight(), 200)))
        this.lastSlopeCmd = undefined
        this.lastCrrCmd = undefined
        await this.write(`$CW${totalWeight}#`); await sleep(100)
        await this.write('$CN0#'); await sleep(100)
        // trainer default is 0.008; 0.004 matches a road bike on tarmac (and Incyclist's own model)
        await this.sendRollingResistance(ROLLING_RESISTANCE); await sleep(100)
        await this.sendSlope(0)
    }

    // ---------------------------------------------------------------- IncyclistDevice API

    async check(): Promise<boolean> {
        this.logEvent({ message: 'checking device', port: this.getPort() })
        if (!await this.open())
            return false

        const idWait = this.waitFor(RX_ID, CHECK_TIMEOUT)
        const consoleWait = this.waitFor(RX_TELEMETRY, CHECK_TIMEOUT)
        await this.write('$PC#')
        const res = await Promise.race([idWait, consoleWait])
        if (res && RX_ID.test(res[0])) {
            this.trainerId = res[1]
            this.trainerVersion = res[2]
        }
        const found = !!res
        this.logEvent({ message: found ? 'checking device success' : 'checking device failed', port: this.getPort(), id: this.trainerId, version: this.trainerVersion })
        return found
    }

    async start(startProps?: DeviceProperties): Promise<boolean> {
        this.getStartProps(startProps)
        this.logEvent({ message: 'start()', port: this.getPort() })

        for (let tries = 0; tries < 3; tries++) {
            if (await this.open()) {
                const ok = this.bkoolData || await this.waitFor(RX_TELEMETRY, CHECK_TIMEOUT)
                if (ok) {
                    await this.sendDefaults()
                    this.started = true
                    this.stopped = false
                    this.paused = false
                    this.startEmitting()
                    return true
                }
            }
            await sleep(1000)
        }
        throw new Error('could not start device, reason: no data from trainer')
    }

    async stop(): Promise<boolean> {
        this.logEvent({ message: 'stop()' })
        if (this.iv) { clearInterval(this.iv); this.iv = undefined }
        try { await this.sendSlope(0) } catch { }
        await this.close()
        this.stopped = true
        this.started = false
        this.paused = false
        return true
    }

    protected startEmitting() {
        if (this.iv)
            return
        this.iv = setInterval(() => this.emitTrainerData(), EMIT_INTERVAL)
    }

    update() { this.emitTrainerData() }

    protected emitTrainerData() {
        try {
            const d = this.bkoolData
            const fresh = d && (Date.now() - d.timestamp) < DATA_TIMEOUT
            const bikeData: IncyclistBikeData = {
                power: fresh ? d.power : 0,
                speed: fresh ? d.speed : 0,
                pedalRpm: fresh ? d.cadence : 0,
                isPedalling: fresh ? (d.power > 0 || d.speed > 3) : false,
                slope: d?.slope
            }

            const now = Date.now()
            const dt = this.prevTs ? (now - this.prevTs) / 1000 : 0
            this.prevTs = now

            const data = this.getCyclingMode().updateData(bikeData)
            const distance = (data.speed ?? 0) / 3.6 * dt
            this.distanceInternal += distance

            this.data = {
                power: data.power,
                speed: data.speed,
                cadence: data.pedalRpm,
                slope: data.slope,
                distance,
                internalDistanceCounter: this.distanceInternal,
                timestamp: now
            } as IncyclistAdapterData
            this.emitData(this.data)

            // smart trainer mode may want to refresh the slope regularly
            const refresh = this.getCyclingMode().buildUpdate({ refresh: true } as UpdateRequest)
            if (refresh?.slope !== undefined)
                this.sendSlope(refresh.slope)
        }
        catch (err) {
            this.logEvent({ message: 'update error', error: err?.message, stack: err?.stack })
        }
    }

    async sendUpdate(request: UpdateRequest): Promise<UpdateRequest | void> {
        if (this.paused || !this.started)
            return
        const update = this.getCyclingMode().buildUpdate(request)
        this.logEvent({ message: 'sendUpdate', request, update })
        if (update?.slope !== undefined)
            await this.sendSlope(update.slope)
        return update
    }

    async connect(): Promise<boolean> { return await this.open() }
}
