import { OpenBikeControlAdapter } from './adapter'

describe('OpenBikeControlAdapter', () => {

    const settings = (extra = {}) => ({ interface: 'wifi', name: 'BikeControl', protocol: 'openbikecontrol', address: '10.0.0.7', ...extra }) as any

    test('start does not wait for data, as controllers only send data when a button is pressed', () => {
        const adapter: any = new OpenBikeControlAdapter(settings())
        expect(adapter.shouldWaitForData()).toBe(false)
    })

    test('controllers with the same name but different addresses are different devices', () => {
        const adapter = new OpenBikeControlAdapter(settings())
        expect(adapter.isEqual(settings())).toBe(true)
        expect(adapter.isEqual(settings({ address: '10.0.0.8' }))).toBe(false)
        expect(adapter.isSame(new OpenBikeControlAdapter(settings({ address: '10.0.0.8' })))).toBe(false)
    })

    describe('startSensor', () => {
        const run = async (error: Error) => {
            const adapter: any = new OpenBikeControlAdapter(settings({ interface: 'ble', address: 'aa:bb:cc:dd:ee:ff' }))
            const base = Object.getPrototypeOf(OpenBikeControlAdapter.prototype)
            const spy = jest.spyOn(base, 'startSensor').mockRejectedValue(error)
            const logEvent = jest.spyOn(adapter, 'logEvent').mockImplementation(() => { })
            const result = await adapter.startSensor()
            spy.mockRestore()
            return { result, logs: logEvent.mock.calls.map(c => c[0] as any) }
        }

        test.each(['peripheral wait cancelled', 'peripheral not found'])('%s is not logged as an error', async (message) => {
            const { result, logs } = await run(new Error(message))
            expect(result).toBe(false)
            expect(logs).toHaveLength(1)
            expect(logs[0]).toMatchObject({ message: 'start result: not found', reason: message })
            expect(logs[0].error).toBeUndefined()
        })

        test('any other failure is still logged as an error', async () => {
            const { result, logs } = await run(new Error('boom'))
            expect(result).toBe(false)
            expect(logs[0]).toMatchObject({ message: 'error', fn: 'startSensor', error: 'boom' })
        })

        test('forwards key-pressed events of the sensor, with a single handler even if started again', async () => {
            const adapter: any = new OpenBikeControlAdapter(settings({ interface: 'ble', address: 'aa:bb:cc:dd:ee:ff' }))
            const base = Object.getPrototypeOf(OpenBikeControlAdapter.prototype)
            const spy = jest.spyOn(base, 'startSensor').mockResolvedValue(true)
            const sensor = { on: jest.fn(), off: jest.fn() }
            adapter.device = sensor
            const emitted = jest.fn()
            adapter.on('key-pressed', emitted)

            expect(await adapter.startSensor()).toBe(true)
            expect(await adapter.startSensor()).toBe(true)
            spy.mockRestore()

            const handler = sensor.on.mock.calls[0][1]
            expect(sensor.on).toHaveBeenCalledTimes(2)
            expect(sensor.on.mock.calls[1][1]).toBe(handler)
            expect(sensor.off).toHaveBeenCalledTimes(1)
            expect(sensor.off).toHaveBeenCalledWith('key-pressed', handler)

            handler({ key: 'A' })
            expect(emitted).toHaveBeenCalledWith(adapter.getSettings(), { key: 'A' })
        })
    })

    test('the name contains the end of the address', () => {
        expect(new OpenBikeControlAdapter(settings()).getName()).toBe('BikeControl 0007')
        expect(new OpenBikeControlAdapter(settings({ interface: 'ble', address: 'aa:bb:cc:dd:ee:ff' })).getName()).toBe('BikeControl EEFF')
    })
})
