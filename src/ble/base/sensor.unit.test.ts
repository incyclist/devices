import { TBleSensor } from './sensor'
import { MockLogger } from '../../../test/logger'

class TestSensor extends TBleSensor {
    reset(): void {
        // nothing to reset
    }

    protected getRequiredCharacteristics(): Array<string> {
        return ['2a37']
    }
}

const createPeripheral = () => ({
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    isConnected: jest.fn().mockReturnValue(true),
    onDisconnect: jest.fn(),
    subscribeSelected: jest.fn().mockResolvedValue(true),
    getInfo: jest.fn().mockReturnValue({ name: 'test', address: '1234' }),
    getInterface: jest.fn().mockReturnValue({ isLoggingPaused: jest.fn().mockReturnValue(false) }),
})

const track = <T>(promise: Promise<T>) => {
    const state: { done: boolean, result?: T } = { done: false }
    promise.then(result => {
        state.done = true
        state.result = result
    })
    return state
}

describe('TBleSensor', () => {

    let peripheral: any
    let sensor: any
    let logEvent: any

    beforeEach(() => {
        jest.useFakeTimers()
        peripheral = createPeripheral()
        sensor = new TestSensor(peripheral, { logger: MockLogger })
        logEvent = jest.fn()
        sensor.logEvent = logEvent
        sensor.reconnectAttemptTimeout = 5000
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('subscribe', () => {
        test('reports success when the peripheral is connected after subscribing', async () => {
            const res = await sensor.subscribe()

            expect(res).toBe(true)
            expect(sensor.isSubscribed()).toBe(true)
        })

        test('does not report success when the peripheral is no longer connected after subscribing', async () => {
            peripheral.isConnected.mockReturnValue(false)

            const res = await sensor.subscribe()

            expect(res).toBe(false)
            expect(sensor.isSubscribed()).toBe(false)
        })
    })

    describe('reconnectSensor', () => {

        test('a subscribe that never resolves fails the attempt within a bounded time and the reconnect is retried', async () => {
            peripheral.subscribeSelected
                .mockReturnValueOnce(new Promise(() => { /* GATT discovery stalls forever */ }))
                .mockResolvedValue(true)

            const state = track(sensor.reconnectSensor())

            await jest.advanceTimersByTimeAsync(500 + 5000 + 1000 + 100)

            expect(state.done).toBe(true)
            expect(state.result).toBe(true)
            expect(peripheral.subscribeSelected).toHaveBeenCalledTimes(2)
            // the stalled link is torn down before the retry, so the retry performs a fresh connect
            expect(peripheral.disconnect).toHaveBeenCalled()
            expect(peripheral.connect).toHaveBeenCalledTimes(2)
            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'reconnect sensor attempt timeout' }))
            expect(sensor.isReconnectBusy()).toBe(false)
        })

        test('a connect that never resolves fails the attempt within a bounded time and the reconnect is retried', async () => {
            peripheral.connect
                .mockReturnValueOnce(new Promise(() => { /* connect stalls forever */ }))
                .mockResolvedValue(true)

            const state = track(sensor.reconnectSensor())

            await jest.advanceTimersByTimeAsync(500 + 5000 + 1000 + 100)

            expect(state.done).toBe(true)
            expect(state.result).toBe(true)
            expect(peripheral.connect).toHaveBeenCalledTimes(2)
        })

        test('is reported as busy while the reconnect is in flight', async () => {
            peripheral.subscribeSelected.mockReturnValue(new Promise(() => { /* stalls */ }))

            sensor.reconnectSensor()
            await jest.advanceTimersByTimeAsync(1000)

            expect(sensor.isReconnectBusy()).toBe(true)
        })

        test('is not declared successful while the peripheral is not connected after subscribe()', async () => {
            peripheral.isConnected.mockReturnValue(false)
            const onRecovered = jest.fn()
            sensor.on('connctionRecovered', onRecovered)

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(600)

            expect(peripheral.subscribeSelected).toHaveBeenCalled()
            expect(state.done).toBe(false)
            expect(onRecovered).not.toHaveBeenCalled()

            // link is back - the next attempt succeeds
            peripheral.isConnected.mockReturnValue(true)
            await jest.advanceTimersByTimeAsync(2000)

            expect(state.done).toBe(true)
            expect(state.result).toBe(true)
            expect(onRecovered).toHaveBeenCalledTimes(1)
        })

        test('stops retrying once a stop is requested', async () => {
            peripheral.connect.mockResolvedValue(false)

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(2000)
            expect(state.done).toBe(false)

            await sensor.stopSensor()
            await jest.advanceTimersByTimeAsync(3000)

            expect(state.done).toBe(true)
            expect(state.result).toBe(false)
            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'reconnect sensor completed', success: false, stopRequested: true }))
        })

        test('increments the reconnect count each time a reconnect starts', async () => {
            expect(sensor.getReconnectCount()).toBe(0)

            const state = track(sensor.reconnectSensor())
            expect(sensor.getReconnectCount()).toBe(1)

            await jest.advanceTimersByTimeAsync(1000)
            expect(state.result).toBe(true)
            expect(sensor.getReconnectCount()).toBe(1)
        })

        test('releases the old link before reconnecting after a lost connection', async () => {
            peripheral.releaseLink = jest.fn().mockResolvedValue(undefined)

            const state = track(sensor.reconnectSensor(true))
            await jest.advanceTimersByTimeAsync(1000)

            expect(state.result).toBe(true)
            expect(peripheral.releaseLink).toHaveBeenCalledTimes(1)
            expect(peripheral.releaseLink.mock.invocationCallOrder[0]).toBeLessThan(peripheral.connect.mock.invocationCallOrder[0])
        })

        test('a failing releaseLink does not prevent the reconnect', async () => {
            peripheral.releaseLink = jest.fn().mockRejectedValue(new Error('not connected'))

            const state = track(sensor.reconnectSensor(true))
            await jest.advanceTimersByTimeAsync(1000)

            expect(state.result).toBe(true)
        })
    })

    describe('characteristics check on reconnect', () => {

        const MISSING_USED = { missing: ['2AD2', '2A00'], missingUsed: ['2AD2'] }
        const MISSING_UNUSED = { missing: ['2A00'], missingUsed: [] as string[] }
        const COMPLETE = { missing: [] as string[], missingUsed: [] as string[] }

        beforeEach(() => {
            peripheral.releaseLink = jest.fn().mockResolvedValue(undefined)
            peripheral.verifyCharacteristics = jest.fn().mockResolvedValue(COMPLETE)
        })

        test('succeeds immediately when nothing is missing', async () => {
            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(600)

            expect(state.result).toBe(true)
            expect(peripheral.connect).toHaveBeenCalledTimes(1)
        })

        test('succeeds immediately, with a log entry, when only unused characteristics are missing', async () => {
            peripheral.verifyCharacteristics.mockResolvedValue(MISSING_UNUSED)

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(600)

            expect(state.result).toBe(true)
            expect(peripheral.connect).toHaveBeenCalledTimes(1)
            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'reconnect: unused characteristics missing', missing: '2A00' }))
        })

        test('retries with a fresh connection while used characteristics are missing, and succeeds once they are back', async () => {
            peripheral.verifyCharacteristics
                .mockResolvedValueOnce(MISSING_USED)
                .mockResolvedValueOnce(MISSING_USED)
                .mockResolvedValue(COMPLETE)
            const onRecovered = jest.fn()
            sensor.on('connctionRecovered', onRecovered)

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(500 + 1000 + 1000 + 500)

            expect(state.result).toBe(true)
            expect(peripheral.connect).toHaveBeenCalledTimes(3)
            // each failed attempt tears down the link, so the next one performs a fresh discovery
            expect(peripheral.disconnect).toHaveBeenCalledTimes(2)
            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'reconnect: used characteristics missing', missingUsed: '2AD2', attempt: 1 }))
            expect(onRecovered).toHaveBeenCalledTimes(1)
        })

        test('gives up after the characteristics timeout and reports the reconnect as failed', async () => {
            peripheral.verifyCharacteristics.mockResolvedValue(MISSING_USED)
            sensor.reconnectCharacteristicsTimeout = 30000
            const onFailed = jest.fn()
            const onRecovered = jest.fn()
            sensor.on('connctionRecoveryFailed', onFailed)
            sensor.on('connctionRecovered', onRecovered)

            const state = track(sensor.reconnectSensor())

            await jest.advanceTimersByTimeAsync(29000)
            expect(state.done).toBe(false)

            await jest.advanceTimersByTimeAsync(3000)
            expect(state.done).toBe(true)
            expect(state.result).toBe(false)
            expect(onFailed).toHaveBeenCalledTimes(1)
            expect(onRecovered).not.toHaveBeenCalled()
            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'reconnect sensor failed', reason: 'used characteristics missing' }))
            expect(sensor.isReconnectBusy()).toBe(false)
        })

        test('the timeout only applies to missing characteristics: a failing connect keeps retrying', async () => {
            peripheral.connect.mockResolvedValue(false)
            sensor.reconnectCharacteristicsTimeout = 3000

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(20000)

            expect(state.done).toBe(false)
            await sensor.stopSensor()
            await jest.advanceTimersByTimeAsync(2000)
        })

        test('a stale "incomplete" state of an earlier attempt does not cap a later failing connect', async () => {
            sensor.reconnectCharacteristicsTimeout = 3000
            peripheral.verifyCharacteristics.mockResolvedValueOnce(MISSING_USED)
            peripheral.connect
                .mockResolvedValueOnce(true)
                .mockResolvedValue(false)

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(15000)

            expect(state.done).toBe(false)
            await sensor.stopSensor()
            await jest.advanceTimersByTimeAsync(2000)
        })

        test('a peripheral without a characteristics check is not affected', async () => {
            delete peripheral.verifyCharacteristics

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(600)

            expect(state.result).toBe(true)
        })

        test('a throwing characteristics check does not block the reconnect', async () => {
            peripheral.verifyCharacteristics.mockRejectedValue(new Error('boom'))

            const state = track(sensor.reconnectSensor())
            await jest.advanceTimersByTimeAsync(600)

            expect(state.result).toBe(true)
        })
    })
})
