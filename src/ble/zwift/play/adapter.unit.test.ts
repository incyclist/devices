import { ZwiftPlayAdapter } from './adapter'

describe('ZwiftPlayAdapter', () => {

    const settings = () => ({ interface: 'ble', name: 'Zwift Click D7D0', protocol: 'zwift-play', address: 'aa:bb:cc:dd:ee:ff' }) as any

    describe('startSensor', () => {
        const run = async (error: Error) => {
            const adapter: any = new ZwiftPlayAdapter(settings())
            const base = Object.getPrototypeOf(ZwiftPlayAdapter.prototype)
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
    })
})
