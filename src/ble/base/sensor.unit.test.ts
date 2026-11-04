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
    })
})
