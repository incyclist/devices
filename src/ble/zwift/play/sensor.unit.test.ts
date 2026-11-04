import { BleZwiftPlaySensor } from './sensor'
import { TrainerResponse } from '../../../proto/zwift_hub'
import { MockLogger } from '../../../../test/logger'

const buildTrainerResponseMessage = () => {
    const text = Buffer.from('a reasonably long trainer response text field, used so a split lands inside it')
    const bytes = TrainerResponse.toBinary({ unknown: 5, content: { text } })
    return Buffer.from(bytes)
}

describe('BleZwiftPlaySensor', () => {

    describe('onMeasurement - trainer response reassembly', () => {
        let sensor: any

        beforeEach(() => {
            sensor = new BleZwiftPlaySensor({} as any, { logger: MockLogger })
            sensor.logEvent = jest.fn()
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        test('single-packet message decodes as before', () => {
            const message = buildTrainerResponseMessage()
            const raw = Buffer.concat([Buffer.from([0x2A]), message])

            const onTrainerResponse = jest.fn()
            sensor.on('hub-trainer-response', onTrainerResponse)

            sensor.onMeasurement(raw)

            expect(onTrainerResponse).toHaveBeenCalledTimes(1)
            expect(sensor.logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Error' }))
        })

        test('a message split across 2 BLE notifications reassembles and decodes correctly', () => {
            const message = buildTrainerResponseMessage()
            const splitAt = message.length - 5 // land the split inside the text field's payload

            const fragment1 = Buffer.concat([Buffer.from([0x2A]), message.subarray(0, splitAt)])
            const fragment2 = message.subarray(splitAt) // pure continuation, no type byte

            const onTrainerResponse = jest.fn()
            sensor.on('hub-trainer-response', onTrainerResponse)

            sensor.onMeasurement(fragment1)
            expect(onTrainerResponse).not.toHaveBeenCalled()

            sensor.onMeasurement(fragment2)

            expect(onTrainerResponse).toHaveBeenCalledTimes(1)
            expect(sensor.logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Error' }))
        })

        test('a permanently truncated fragment is dropped and logged exactly once', () => {
            jest.useFakeTimers()

            const message = buildTrainerResponseMessage()
            const fragment1 = Buffer.concat([Buffer.from([0x2A]), message.subarray(0, message.length - 5)])

            sensor.onMeasurement(fragment1)
            expect(sensor.logEvent).not.toHaveBeenCalled()

            jest.advanceTimersByTime(BleZwiftPlaySensor.MEASUREMENT_REASSEMBLY_TIMEOUT + 10)

            expect(sensor.logEvent).toHaveBeenCalledTimes(1)
            expect(sensor.logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'error', fn: 'onMeasurement' }))

            // a further, unrelated truncation later in the session must not log again
            sensor.onMeasurement(fragment1)
            jest.advanceTimersByTime(BleZwiftPlaySensor.MEASUREMENT_REASSEMBLY_TIMEOUT + 10)
            expect(sensor.logEvent).toHaveBeenCalledTimes(1)
        })
    })

    describe('resetHubState - peripheral reconnect invalidates hub pairing', () => {
        let sensor: any

        beforeEach(() => {
            const peripheral = {
                isConnected: jest.fn().mockReturnValue(true),
                write: jest.fn().mockResolvedValue(Buffer.from([])),
                disconnect: jest.fn().mockResolvedValue(true),
                onDisconnect: jest.fn(),
                getInterface: jest.fn().mockReturnValue({ isLoggingPaused: jest.fn().mockReturnValue(false) }),
            }
            sensor = new BleZwiftPlaySensor(peripheral, { logger: MockLogger })
            sensor.isHubServiceActive = true
            sensor.isHubServicePaired = true
            sensor.isHubServiceSubscribed = true
            sensor.isHubPairConfirmed = true
        })

        test('clears all cached hub pairing state so the next command re-runs the handshake', () => {
            sensor.resetHubState()

            expect(sensor.isHubServiceActive).toBe(false)
            expect(sensor.isHubServicePaired).toBe(false)
            expect(sensor.isHubServiceSubscribed).toBe(false)
            expect(sensor.isHubPairConfirmed).toBe(false)
        })
    })

    describe('setSimulationData - write racing a concurrent stopSensor()', () => {
        let sensor: any
        let peripheral: any
        let logEvent: any

        beforeEach(() => {
            logEvent = jest.fn()
            peripheral = {
                isConnected: jest.fn().mockReturnValue(true),
                write: jest.fn().mockResolvedValue(Buffer.from([])),
                disconnect: jest.fn().mockResolvedValue(true),
                onDisconnect: jest.fn(),
                getInterface: jest.fn().mockReturnValue({ isLoggingPaused: jest.fn().mockReturnValue(false) }),
            }
            sensor = new BleZwiftPlaySensor(peripheral, { logger: MockLogger })
            sensor.logger = { logEvent }
            sensor.isHubServiceActive = true
            sensor.isHubPairConfirmed = true
        })

        test('a write that fails because a stop was already requested logs a warning, not an error', async () => {
            await sensor.stopSensor() // flips stopRequested synchronously, same as a pairing-group abort would

            // the peripheral has now actually disconnected - a command queued before the abort
            // reaches write() only after this point, exactly like the production race
            peripheral.isConnected.mockReturnValue(false)

            await sensor.setSimulationData({ inclineX100: 5 })

            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'warning', fn: 'setSimulationData' }))
            expect(logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
        })

        test('a write that fails without a stop having been requested still logs an error', async () => {
            peripheral.isConnected.mockReturnValue(false) // an unexpected disconnect, not a deliberate stop

            await sensor.setSimulationData({ inclineX100: 5 })

            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'error', fn: 'setSimulationData' }))
        })

        test('a write that fails while a reconnect from a known disconnect is already in flight logs a warning, not an error', async () => {
            peripheral.isConnected.mockReturnValue(false)
            sensor.reconnectPromise = new Promise(() => { /* never resolves within the test */ })

            await sensor.setSimulationData({ inclineX100: 5 })

            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'warning', fn: 'setSimulationData' }))
            expect(logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
        })
    })

    describe('setGearRatio - write racing a concurrent stopSensor() or in-flight reconnect', () => {
        let sensor: any
        let peripheral: any
        let logEvent: any

        beforeEach(() => {
            logEvent = jest.fn()
            peripheral = {
                isConnected: jest.fn().mockReturnValue(true),
                write: jest.fn().mockResolvedValue(Buffer.from([])),
                disconnect: jest.fn().mockResolvedValue(true),
                onDisconnect: jest.fn(),
                getInterface: jest.fn().mockReturnValue({ isLoggingPaused: jest.fn().mockReturnValue(false) }),
            }
            sensor = new BleZwiftPlaySensor(peripheral, { logger: MockLogger })
            sensor.logger = { logEvent }
            sensor.isHubServiceActive = true
            sensor.isHubPairConfirmed = true
        })

        test('a write that fails because a stop was already requested logs a warning, not an error', async () => {
            await sensor.stopSensor()
            peripheral.isConnected.mockReturnValue(false)

            await sensor.setGearRatio(2.5)

            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'warning', fn: 'setGearRatio' }))
            expect(logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
        })

        test('a write that fails while a reconnect from a known disconnect is already in flight logs a warning, not an error', async () => {
            peripheral.isConnected.mockReturnValue(false)
            sensor.reconnectPromise = new Promise(() => { /* never resolves within the test */ })

            await sensor.setGearRatio(2.5)

            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'warning', fn: 'setGearRatio' }))
            expect(logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
        })

        test('a write that fails without a stop or reconnect in flight still logs an error', async () => {
            peripheral.isConnected.mockReturnValue(false)

            await sensor.setGearRatio(2.5)

            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'error', fn: 'setGearRatio' }))
        })
    })

    describe('reconnectSensor - re-pairing after the link was re-established', () => {
        let sensor: any
        let baseReconnect: any

        beforeEach(() => {
            jest.useFakeTimers()
            const peripheral = {
                isConnected: jest.fn().mockReturnValue(true),
                write: jest.fn().mockResolvedValue(Buffer.from([])),
                disconnect: jest.fn().mockResolvedValue(true),
                onDisconnect: jest.fn(),
                getInfo: jest.fn().mockReturnValue({ name: 'Zwift Click', address: '1234' }),
                getInterface: jest.fn().mockReturnValue({ isLoggingPaused: jest.fn().mockReturnValue(false) }),
            }
            sensor = new BleZwiftPlaySensor(peripheral as any, { logger: MockLogger })
            sensor.logEvent = jest.fn()
            baseReconnect = jest.spyOn(Object.getPrototypeOf(BleZwiftPlaySensor.prototype), 'reconnectSensor')
                .mockResolvedValue(true)
        })

        afterEach(() => {
            baseReconnect.mockRestore()
            jest.useRealTimers()
        })

        test('awaits pair() before reporting the reconnect result', async () => {
            let resolvePair: (v: boolean) => void
            sensor.pair = jest.fn().mockReturnValue(new Promise<boolean>(done => { resolvePair = done }))

            let result: boolean | undefined
            sensor.reconnectSensor().then((r: boolean) => { result = r })
            await jest.advanceTimersByTimeAsync(10)

            expect(sensor.pair).toHaveBeenCalledTimes(1)
            expect(result).toBeUndefined()
            expect(sensor.isReconnectBusy()).toBe(true)

            resolvePair(true)
            await jest.advanceTimersByTimeAsync(10)

            expect(result).toBe(true)
            expect(sensor.isReconnectBusy()).toBe(false)
        })

        test('retries a failed pair()', async () => {
            sensor.pair = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true)

            let result: boolean | undefined
            sensor.reconnectSensor().then((r: boolean) => { result = r })
            await jest.advanceTimersByTimeAsync(5000)

            expect(sensor.pair).toHaveBeenCalledTimes(2)
            expect(result).toBe(true)
        })

        test('reports a reconnect as failed if pairing keeps failing', async () => {
            sensor.pair = jest.fn().mockResolvedValue(false)

            let result: boolean | undefined
            sensor.reconnectSensor().then((r: boolean) => { result = r })
            await jest.advanceTimersByTimeAsync(10000)

            expect(result).toBe(false)
            expect(sensor.logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'reconnect sensor pairing failed' }))
        })

        test('does not try to pair if the link could not be re-established', async () => {
            baseReconnect.mockResolvedValue(false)
            sensor.pair = jest.fn().mockResolvedValue(true)

            const result = await sensor.reconnectSensor()

            expect(result).toBe(false)
            expect(sensor.pair).not.toHaveBeenCalled()
        })
    })

    describe('Zwift Hub - writes while the trainer sensor (owner of the shared peripheral) reconnects', () => {
        let sensor: any
        let owner: any
        let peripheral: any
        let logEvent: any

        beforeEach(() => {
            logEvent = jest.fn()
            peripheral = {
                isConnected: jest.fn().mockReturnValue(false),
                write: jest.fn().mockRejectedValue(new Error('not connected')),
                subscribeSelected: jest.fn().mockResolvedValue(true),
                disconnect: jest.fn().mockResolvedValue(true),
                onDisconnect: jest.fn(),
                getInfo: jest.fn().mockReturnValue({ name: 'JUSTO 2', address: '1234' }),
                getInterface: jest.fn().mockReturnValue({ isLoggingPaused: jest.fn().mockReturnValue(false) }),
            }
            owner = {
                getPeripheral: () => peripheral,
                startSensor: jest.fn(),
                isReconnectBusy: jest.fn().mockReturnValue(true),
                getReconnectCount: jest.fn().mockReturnValue(1),
            }
            sensor = new BleZwiftPlaySensor(owner, { logger: MockLogger, isTrainer: true })
            sensor.logger = { logEvent }
            sensor.logEvent = jest.fn()
        })

        test('reports the reconnect of the owner as its own', () => {
            expect(sensor.isReconnectBusy()).toBe(true)
            owner.isReconnectBusy.mockReturnValue(false)
            expect(sensor.isReconnectBusy()).toBe(false)
        })

        test('setGearRatio is skipped: no discovery/subscribe, no write, logged as warning not error', async () => {
            await sensor.setGearRatio(2.5)

            expect(peripheral.subscribeSelected).not.toHaveBeenCalled()
            expect(peripheral.write).not.toHaveBeenCalled()
            expect(logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
            expect(sensor.logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'warning', fn: 'setGearRatio', reason: 'reconnect in progress' }))
        })

        test('setSimulationData is skipped: no discovery/subscribe, no write, logged as warning not error', async () => {
            await sensor.setIncline(2)

            expect(peripheral.subscribeSelected).not.toHaveBeenCalled()
            expect(peripheral.write).not.toHaveBeenCalled()
            expect(logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
            expect(sensor.logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'warning', fn: 'setSimulationData', reason: 'reconnect in progress' }))
        })

        test('a write that fails during the owner reconnect (race) is logged as warning', async () => {
            owner.isReconnectBusy.mockReturnValueOnce(false).mockReturnValue(true)
            sensor.isHubServiceActive = true
            sensor.isHubPairConfirmed = true
            owner.getReconnectCount.mockReturnValue(0)
            sensor.ownerReconnectCount = 0

            await sensor.setGearRatio(2.5)

            expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'warning', fn: 'setGearRatio' }))
            expect(logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'error' }))
        })

        test('hub state from before a reconnect of the owner is discarded, so the hub is re-initialized on the next write', async () => {
            owner.isReconnectBusy.mockReturnValue(false)
            owner.getReconnectCount.mockReturnValue(0)
            sensor.ownerReconnectCount = 0
            sensor.isHubServiceActive = true
            sensor.isHubServicePaired = true
            sensor.isHubServiceSubscribed = true
            sensor.isHubPairConfirmed = true

            // owner reconnected in the meantime
            owner.getReconnectCount.mockReturnValue(1)
            peripheral.isConnected.mockReturnValue(true)
            peripheral.write.mockResolvedValue(Buffer.from([]))
            sensor.initHubService = jest.fn().mockResolvedValue(false)

            await sensor.setGearRatio(2.5)

            expect(sensor.initHubService).toHaveBeenCalled()
            expect(sensor.isHubServicePaired).toBe(false)
        })
    })
})
