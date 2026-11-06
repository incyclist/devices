import { BleOpenBikeControlSensor } from './sensor'
import { BleAdapterFactory } from '../index'
import { MockLogger } from '../../../test/logger'

const BUTTON_STATE = 'd273f681-d548-419d-b9d1-fa0472345229'
const APP_INFO = 'd273f683-d548-419d-b9d1-fa0472345229'

describe('BleOpenBikeControlSensor', () => {

    describe('onData - button state', () => {
        let sensor: any
        let onKey: any

        const send = (...bytes:number[]) => sensor.onData(BUTTON_STATE, Buffer.from(bytes))

        beforeEach(() => {
            sensor = new BleOpenBikeControlSensor({ getInfo: () => ({}) } as any, { logger: MockLogger })
            sensor.logEvent = jest.fn()
            onKey = jest.fn()
            sensor.on('key-pressed', onKey)
        })

        test.each([
            [0x01, 'r-shift-up'],
            [0x02, 'r-shift-down'],
            [0x30, 'y'],
            [0x31, 'b'],
            [0x32, 'a'],
            [0x36, 'z'],
        ])('button %i emits key %s on release', (buttonId, key) => {
            send(0x01, buttonId, 0x01)
            expect(onKey).not.toHaveBeenCalled()

            send(0x01, buttonId, 0x00)
            expect(onKey).toHaveBeenCalledTimes(1)
            expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ key, duration: expect.any(Number) }))
        })

        test('long press reports the duration', () => {
            jest.useFakeTimers()
            send(0x01, 0x01, 0x01)
            jest.advanceTimersByTime(1500)
            send(0x01, 0x01, 0x00)
            jest.useRealTimers()

            expect(onKey).toHaveBeenCalledWith({ key: 'r-shift-up', duration: 1500 })
        })

        test.each([
            ['Shift Up + Increase Difficulty + Select', [0x01, 0x30, 0x14], 'up'],
            ['Shift Down + Decrease Difficulty + Back', [0x02, 0x31, 0x15], 'down'],
            ['Shift Up + Increase Difficulty + Skip Interval', [0x01, 0x30, 0x32], 'up'],
            ['Shift Up + Decrease Difficulty', [0x01, 0x31], 'r-shift-up'],
            ['Increase Difficulty + Skip Interval', [0x30, 0x32], 'y'],
            ['Skip Interval + Previous Interval + Select', [0x32, 0x36, 0x14], 'a'],
            ['Shift Up + Shift Down', [0x01, 0x02], 'r-shift-up'],
        ])('several actions for one button (%s) result in exactly one key', (_name, ids: number[], key) => {
            send(0x01, ...ids.flatMap(id => [id, 0x01]))
            send(0x01, ...ids.flatMap(id => [id, 0x00]))

            expect(onKey).toHaveBeenCalledTimes(1)
            expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ key }))
        })

        test('a press is reported once all of its actions are released, also if released with separate messages', () => {
            send(0x01, 0x01, 0x01, 0x30, 0x01)
            send(0x01, 0x01, 0x00)
            expect(onKey).not.toHaveBeenCalled()

            send(0x01, 0x30, 0x00)
            expect(onKey).toHaveBeenCalledTimes(1)
            expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ key: 'up' }))
        })

        test('buttons pressed with separate messages are separate presses', () => {
            send(0x01, 0x01, 0x01)
            send(0x01, 0x32, 0x01)
            send(0x01, 0x01, 0x00, 0x32, 0x00)

            expect(onKey).toHaveBeenCalledTimes(2)
            expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ key: 'r-shift-up' }))
            expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }))
        })

        test('release without press, unsupported buttons and other messages are ignored', () => {
            send(0x01, 0x01, 0x00)
            send(0x01, 0x14, 0x01)
            send(0x01, 0x14, 0x00)
            send(0x02, 0x55, 0x01)
            sensor.onData('d273f682-d548-419d-b9d1-fa0472345229', Buffer.from([0x01, 0x01, 0x01]))

            expect(onKey).not.toHaveBeenCalled()
        })

        test('a disconnect clears pressed buttons', () => {
            send(0x01, 0x01, 0x01)
            sensor.onDisconnect()
            send(0x01, 0x01, 0x00)

            expect(onKey).not.toHaveBeenCalled()
        })
    })

    describe('subscribe - app information', () => {
        test('sends app id and supported buttons after subscribing', async () => {
            const peripheral = {
                isConnected: jest.fn(() => true),
                subscribeSelected: jest.fn(async () => true),
                write: jest.fn(async () => Buffer.from([])),
            }
            const sensor = new BleOpenBikeControlSensor(peripheral as any, { logger: MockLogger })

            const subscribed = await sensor.subscribe()

            expect(subscribed).toBe(true)
            expect(peripheral.subscribeSelected).toHaveBeenCalledWith([BUTTON_STATE], expect.any(Function))
            const expected = Buffer.from([0x04, 0x01, 0x09, ...Buffer.from('incyclist'), 0x00, 0x06, 0x01, 0x02, 0x30, 0x31, 0x32, 0x36])
            expect(peripheral.write).toHaveBeenCalledWith(APP_INFO, expected, { withoutResponse: true })
        })

        test('a failing app information write does not fail the subscription', async () => {
            const peripheral = {
                isConnected: jest.fn(() => true),
                subscribeSelected: jest.fn(async () => true),
                write: jest.fn(async () => { throw new Error('not supported') }),
            }
            const sensor = new BleOpenBikeControlSensor(peripheral as any, { logger: MockLogger })

            expect(await sensor.subscribe()).toBe(true)
        })
    })

    describe('detection', () => {
        const factory = BleAdapterFactory.getInstance('ble')

        test('OpenBikeControl service', () => {
            expect(factory.getProtocol(['d273f680d548419db9d1fa0472345229'])).toBe('openbikecontrol')
        })

        test('a trainer that also offers OpenBikeControl is detected as trainer', () => {
            expect(factory.getProtocol(['1826', 'd273f680-d548-419d-b9d1-fa0472345229'])).toBe('fm')
        })
    })
})
