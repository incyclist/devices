import { EventLogger } from 'gd-eventlog';
import { MockBinding } from '@serialport/binding-mock';
import BkoolClassicAdapter, { PROTOCOL_NAME, calibratePower } from './adapter'
import SerialPortProvider from '../../base/serial-provider';
import SerialAdapterFactory from '../../factories/adapter-factory';
import { MockLogger } from '../../../../test/logger'
import { sleep } from '../../../utils/utils';
import '../../index'

const PORT = 'COM7'
const SETTINGS = { interface: 'serial', port: PORT, protocol: PROTOCOL_NAME, name: 'Bkool Classic' }

const consoleLines = (speed: number, power: number) =>
    `WIND:0.000000 i:0.000000 CR:0.008000 M:80 DRAFT:1.000000 PHOTOINT:0\r\n` +
    `CAD:0rpm FREQ:3260rpm SPD(r/v):${speed.toFixed(1)}/ 0.0 Kmh POS:110.2 MOT:102 TEMP:315 TARGET:61.5w MAGNET:54.4w SHOW:${power}w\r\n`

/** simulates the trainer: streams the console and answers the $PC# hello */
const simulateTrainer = (adapter: any, opts: { answerHello?: boolean, speed?: number, power?: number } = {}) => {
    const { answerHello = true, speed = 25, power = 180 } = opts
    let answered = false
    const iv = setInterval(() => {
        const port = adapter.sp?.port
        if (!port) return
        if (answerHello && !answered && port.recording?.toString().includes('$PC#')) {
            answered = true
            port.emitData(Buffer.from('$RL0004A3000001V01.13#\n'))
        }
        port.emitData(Buffer.from(consoleLines(speed, power)))
    }, 50)
    return () => clearInterval(iv)
}

const sent = (adapter: any): string => adapter.sp?.port?.recording?.toString() ?? ''

describe('BkoolClassicAdapter', () => {

    beforeAll(() => {
        EventLogger.useExternalLogger(MockLogger)
        SerialPortProvider.getInstance().setBinding('serial', MockBinding)
    })

    beforeEach(() => {
        MockBinding.reset()
        MockBinding.createPort(PORT, { echo: false, record: true })
    })

    test('is registered as serial protocol', () => {
        const protocols = SerialAdapterFactory.getInstance().adapters.map(a => a.protocol)
        expect(protocols).toContain('Bkool Classic')
        const adapter = SerialAdapterFactory.getInstance().createInstance(SETTINGS)
        expect(adapter).toBeInstanceOf(BkoolClassicAdapter)
    })

    test('check() identifies the trainer from the $PC# reply', async () => {
        const adapter = new BkoolClassicAdapter(SETTINGS) as any
        const stop = simulateTrainer(adapter)
        const found = await adapter.check()
        stop()
        expect(found).toBe(true)
        expect(adapter.trainerId).toBe('0004A3000001')
        expect(adapter.trainerVersion).toBe('01.13')
        expect(sent(adapter)).toContain('$PC#')
        await adapter.close()
    })

    test('check() also accepts a trainer that only streams its console', async () => {
        const adapter = new BkoolClassicAdapter(SETTINGS) as any
        const stop = simulateTrainer(adapter, { answerHello: false })
        expect(await adapter.check()).toBe(true)
        stop()
        await adapter.close()
    })

    test('check() fails when nothing answers', async () => {
        const adapter = new BkoolClassicAdapter(SETTINGS) as any
        const res = adapter.check()
        expect(await res).toBe(false)
        await adapter.close()
    }, 10000)

    test('start() sends total mass, wind, rolling resistance and flat slope', async () => {
        const adapter = new BkoolClassicAdapter(SETTINGS) as any
        const stop = simulateTrainer(adapter)
        await adapter.start({ userWeight: 75, bikeWeight: 10 })
        expect(sent(adapter)).toBe('$CW85#$CN0#$CF4#$CS0#')
        stop()
        await adapter.stop()
    })

    test('slope requests are sent as $CS<slope*100>#, clamped and de-duplicated', async () => {
        const adapter = new BkoolClassicAdapter(SETTINGS) as any
        const stop = simulateTrainer(adapter)
        await adapter.start({ userWeight: 75, bikeWeight: 10 })
        const before = sent(adapter).length

        await adapter.sendSlope(5)
        await adapter.sendSlope(5)
        await adapter.sendSlope(-3)
        await adapter.sendSlope(40)
        await adapter.sendSlope(-40)

        expect(sent(adapter).slice(before)).toBe('$CS500#$CS-300#$CS2500#$CS-2500#')
        stop()
        await adapter.stop()
    })

    test('emits power and speed from the console', async () => {
        const adapter = new BkoolClassicAdapter(SETTINGS) as any
        const stop = simulateTrainer(adapter, { power: 210 })
        const data: any[] = []
        adapter.on('data', (_s, d) => data.push(d))
        await adapter.start({ userWeight: 75, bikeWeight: 10 })
        await sleep(2500)
        stop()
        await adapter.stop()

        expect(data.length).toBeGreaterThan(0)
        expect(data[data.length - 1].power).toBe(calibratePower(210))
        expect(data[data.length - 1].speed).toBeGreaterThan(0)
    })

    test('parses telemetry lines', () => {
        const adapter = new BkoolClassicAdapter(SETTINGS) as any
        adapter.onLine('CAD:0rpm FREQ:1240rpm SPD(r/v):11.7/14.0 Kmh POS: 0.0 MOT:0 TEMP:315 TARGET:-7.5w MAGNET: 0.1w SHOW:33w')
        expect(adapter.bkoolData).toMatchObject({ speed: 11.7, power: calibratePower(33), cadence: 0 })
        adapter.onLine('WIND:0.000000 i:0.050000 CR:0.004000 M:85 DRAFT:1.000000 PHOTOINT:1')
        expect(adapter.bkoolData.slope).toBeCloseTo(5)
    })
})

describe('Bkool Classic power calibration', () => {
    test('maps trainer power to crank power', () => {
        expect(calibratePower(0)).toBe(0)
        expect(calibratePower(-5)).toBe(0)
        expect(calibratePower(20)).toBe(40)
        expect(calibratePower(100)).toBe(151)
        expect(calibratePower(200)).toBe(286)
    })
})
