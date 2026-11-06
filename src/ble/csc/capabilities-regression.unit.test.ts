import '../index.js'
import { BleAdapterFactory } from '../factories/adapter-factory.js'
import { BleCSCAdapter } from './adapter.js'
import { BleCyclingSpeedCadenceDevice } from './sensor.js'
import { IncyclistCapability } from '../../types/index.js'

const { Speed, Cadence } = IncyclistCapability

describe('CSC capabilities', () => {
    const setup = () => {
        const sensor:any = new BleCyclingSpeedCadenceDevice(null)
        sensor.read = jest.fn()
        sensor.logEvent = jest.fn()
        const adapter:any = Object.create(BleCSCAdapter.prototype)
        adapter.capabilities = [Speed, Cadence]
        adapter.getSensor = () => sensor
        adapter.getSettings = () => ({name:'CSC sensor', interface:'ble'})
        adapter.logEvent = jest.fn()
        adapter.emit = jest.fn()
        return { adapter, sensor }
    }

    test('advertisement resolves to CSC and factory offers cadence', () => {
        const factory = BleAdapterFactory.getInstance('ble')
        expect(factory.getProtocol(['00001816-0000-1000-8000-00805f9b34fb'])).toBe('csc')
        const adapter = factory.createInstance({interface:'ble', protocol:'csc', id:'AA:BB:CC:DD:EE:FF', name:'CSC sensor', address:'AA:BB:CC:DD:EE:FF'})
        expect(adapter.getCapabilities()).toContain(Cadence)
    })

    test('successful feature read maps cadence-only sensor and emits a change', async () => {
        const { adapter, sensor } = setup()
        sensor.read.mockResolvedValue(Buffer.from([0x02, 0x00]))
        await adapter.checkCapabilities()
        expect(sensor.read).toHaveBeenCalledWith('2a5c')
        expect(adapter.getCapabilities()).toEqual([Cadence])
        expect(adapter.emit).toHaveBeenCalledWith('device-info', expect.anything(), {capabilities:[Cadence]})
    })

    test('failed feature read preserves existing capabilities and emits no change', async () => {
        const { adapter, sensor } = setup()
        sensor.read.mockRejectedValue(new Error('read failed'))
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Speed, Cadence])
        expect(adapter.emit).not.toHaveBeenCalled()
    })

    test('successful read after failure updates capabilities', async () => {
        const { adapter, sensor } = setup()
        sensor.read.mockRejectedValueOnce(new Error('read failed')).mockResolvedValueOnce(Buffer.from([0x02, 0x00]))
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Speed, Cadence])
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Cadence])
    })

    test('a successful read with no supported revolution fields clears both capabilities', async () => {
        const { adapter, sensor } = setup()
        sensor.read.mockResolvedValue(Buffer.from([0x00, 0x00]))
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([])
    })

    test('repeated checks preserve known capabilities on failure and restore capabilities on success', async () => {
        const { adapter, sensor } = setup()
        sensor.read.mockResolvedValueOnce(Buffer.from([0x01, 0x00]))
            .mockRejectedValueOnce(new Error('reconnect read failed'))
            .mockResolvedValueOnce(Buffer.from([0x02, 0x00]))
            .mockResolvedValueOnce(Buffer.from([0x03, 0x00]))
            .mockResolvedValueOnce(Buffer.from([0x03, 0x00]))
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Speed])
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Speed])
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Cadence])
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Speed, Cadence])
        await adapter.checkCapabilities()
        expect(adapter.getCapabilities()).toEqual([Speed, Cadence])
        expect(adapter.emit).toHaveBeenCalledTimes(3)
    })
})
