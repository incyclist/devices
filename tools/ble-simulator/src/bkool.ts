import bleno from '@stoprocent/bleno'
import CyclingPowerService from './emulator/services/cp'
import BkoolService from './emulator/services/bkool'
import DeviceInformationService from './emulator/services/device-information'

const NAME = 'BkoolSmartPro2'
const TICK_MS = 1000

class BkoolSimulator {
    protected to: NodeJS.Timeout
    protected tick: NodeJS.Timeout
    protected isConnected: boolean
    protected bleStateChangeHandler = this.onBLEStateChange.bind(this)
    protected connectedPeripherals: string[] = []

    protected power = 150
    protected cadence = 85
    protected revCount = 0
    protected cadTime = 0
    protected random = process.argv.includes('--random')

    protected cp: CyclingPowerService
    protected bkool: BkoolService

    constructor() {
        process.env['BLENO_DEVICE_NAME'] = NAME
    }

    onTimeout() {
        if (this.to && !this.isConnected) {
            console.log('Could not connect to BLE <reason: timeout>')
            clearTimeout(this.to)
            bleno.off('stateChange', this.bleStateChangeHandler)
            bleno.disconnect()
            process.exit(1)
        }
    }

    onConnected() {
        console.log('connected')
        this.isConnected = true
        if (this.to) {
            clearTimeout(this.to)
            delete this.to
        }

        console.log('start advertising ...')
        // Matches the real advertised payload confirmed via ES ("device announced" events,
        // raw over-the-air scan data): every Bkool SmartPro/Pro2/Pro3/Go/Go2 sighting
        // advertises exactly 1818 + 180a, never the 128-bit proprietary UUID (that one only
        // shows up via post-connect GATT discovery, same as here - advertisement payload and
        // GATT services are independent). Keep it to these two 16-bit UUIDs: legacy BLE
        // advertising is capped at 31 bytes and adding the 128-bit UUID here overflows it,
        // which makes BlueZ refuse the whole registration with "Invalid Parameters" - learned
        // that the hard way earlier in this investigation.
        bleno.startAdvertising(NAME, ['1818', '180a'], (err) => {
            if (err)
                console.log('could not start advertising - reason:', err.message)
        })

        bleno.on('advertisingStart', () => {
            console.log('started advertising')

            try {
                this.cp = new CyclingPowerService()
                this.bkool = new BkoolService()
                const deviceInfo = new DeviceInformationService()
                bleno.setServices([this.cp, this.bkool, deviceInfo])

                console.log('set services done')
                this.tick = setInterval(() => this.onTick(), TICK_MS)
            }
            catch (err) {
                console.log(err)
            }
        })

        bleno.on('accept', (cAddress) => {
            if (!this.connectedPeripherals.includes(cAddress))
                this.connectedPeripherals.push(cAddress)
            console.log('client accepted: ' + cAddress + ' devices connected: ' + this.connectedPeripherals.length,
                this.connectedPeripherals.length > 0 ? ':' + this.connectedPeripherals.join(',') : '');
        });

        bleno.on('disconnect', (cAddress) => {
            const idx = this.connectedPeripherals.indexOf(cAddress)
            if (idx !== -1)
                this.connectedPeripherals.splice(idx, 1)

            console.log('client disconnected: ' + cAddress);
            console.log('devices connected: ' + this.connectedPeripherals.length,
                this.connectedPeripherals.length > 0 ? ':' + this.connectedPeripherals.join(',') : '');
        })

        bleno.on('advertisingStartError', (error) => {
            console.log('advertisingStartError', error?.message)
        });

        bleno.on('servicesSet', (error) => {
            if (!error)
                console.log('Services set')
            else
                console.log('Services set error', error.message)
        });

        bleno.on('servicesSetError', (error) => {
            console.log('Services set error', error?.message)
        });
    }

    onTick() {
        if (this.random) {
            this.power = Math.max(0, this.power + Math.round((Math.random() - 0.5) * 16))
            this.cadence = Math.max(0, Math.min(120, this.cadence + Math.round((Math.random() - 0.5) * 6)))
        }
        else {
            const targetPower = this.bkool?.control?.state?.targetPower
            if (targetPower !== undefined)
                this.power += (targetPower - this.power) * 0.3
        }

        if (this.cadence > 0) {
            this.revCount = (this.revCount + 1) % 65536
            this.cadTime = (this.cadTime + Math.round(1024 * 60 / Math.max(this.cadence, 1))) % 65536
        }

        this.cp.cyclingPowerMeasurement.update({
            watts: Math.round(this.power),
            rev_count: this.revCount,
            cad_time: this.cadTime,
        })
        this.cp.notify()

        // probe: also push the same bytes over the Bkool control characteristic - see note in
        // bkool-control-characteristic.ts
        this.bkool?.control?.pushTelemetry(this.cp.cyclingPowerMeasurement.value as Buffer)

        const { targetPower, targetSlope, basicResistance } = this.bkool?.control?.state ?? {}
        console.log(`[TICK] power=${this.power.toFixed(0)}W cadence=${this.cadence}rpm` +
            (targetPower !== undefined ? ` targetPower=${targetPower}W` : '') +
            (targetSlope !== undefined ? ` targetSlope=${targetSlope}%` : '') +
            (basicResistance !== undefined ? ` basicResistance=${basicResistance}` : ''))
    }

    onDisconnected() {
        this.isConnected = false
        console.log('disconnected')
        if (this.tick) {
            clearInterval(this.tick)
            delete this.tick
        }
    }

    onBLEStateChange(state) {
        if (state === 'poweredOn') {
            this.onConnected()
        }
        else {
            this.onDisconnected()
        }
    }

    start() {
        console.log('connecting to BLE ....')

        if (!this.to)
            this.to = setTimeout(() => { this.onTimeout() }, 5000)

        bleno.on('stateChange', this.bleStateChangeHandler)
    }
}

export const main = async () => {
    const bkool = new BkoolSimulator()
    bkool.start()
}
