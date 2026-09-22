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
    })
})
