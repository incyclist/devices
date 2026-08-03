import { EventEmitter } from 'events'
import { BlePeripheral } from './peripheral'
import { beautifyUUID } from '../utils'
import { BleCharacteristic, BleProperty } from '../types'

// Minimal noble-style characteristic mock - a plain EventEmitter, matching
// `BleRawCharacteristic extends BleCharacteristic, EventEmitter` (src/ble/types.ts).
class MockChar extends EventEmitter implements BleCharacteristic {
    uuid: string
    properties: BleProperty[] = ['write', 'notify']
    name?: string

    constructor(uuid: string) {
        super()
        this.uuid = uuid
    }

    subscribe(callback: (err: Error | undefined) => void): void {
        callback(undefined)
    }
    unsubscribe(callback: (err: Error | undefined) => void): void {
        callback(undefined)
    }
    read(callback: (err: Error | undefined, data: Buffer) => void): void {
        callback(undefined, Buffer.from([]))
    }
    write(_data: Buffer, _withoutResponse: boolean, callback?: (err: Error | undefined) => void): void {
        callback?.(undefined)
    }
}

const CP = '2AD9'   // FTMS Control Point - the shared characteristic at the centre of FIXES_BACKLOG #25

describe('BlePeripheral', () => {

    describe('write (FIXES_BACKLOG #25)', () => {

        const setup = () => {
            const announcement: any = { peripheral: { id: 'p1', address: 'AA:BB:CC:DD:EE:FF' }, serviceUUIDs: [] }
            const p: any = new BlePeripheral(announcement)
            p.connected = true
            p.logEvent = () => {}

            const c = new MockChar(CP)
            p.characteristics = { [beautifyUUID(CP)]: c }
            p.subscribe = vi.fn().mockResolvedValue(true)

            return { p, c }
        }

        test('a successful write resolves with the response and removes its own listener', async () => {
            const { p, c } = setup()

            const promise = p.write(CP, Buffer.from([0x00]))
            // give the subscribe().then(write) chain a tick to attach the listener
            await Promise.resolve()
            await Promise.resolve()

            expect(c.listenerCount('data')).toBe(1)

            const response = Buffer.from([0x80, 0x00, 0x01])
            c.emit('data', response)

            await expect(promise).resolves.toEqual(response)
            expect(c.listenerCount('data')).toBe(0)
        })

        test('a write-callback error rejects the promise and removes its own listener', async () => {
            const { p, c } = setup()

            c.write = (_data: Buffer, _withoutResponse: boolean, callback?: (err: Error | undefined) => void) => {
                callback?.(new Error('gatt write failed'))
            }

            const promise = p.write(CP, Buffer.from([0x00]))

            await expect(promise).rejects.toThrow('gatt write failed')
            expect(c.listenerCount('data')).toBe(0)
        })

        test('an abandoned/timed-out write (aborted via signal) does not leave a dangling listener', async () => {
            const { p, c } = setup()

            const controller = new AbortController()
            const promise = p.write(CP, Buffer.from([0x00]), { timeout: 5000, signal: controller.signal })
            await Promise.resolve()
            await Promise.resolve()

            expect(c.listenerCount('data')).toBe(1)

            controller.abort()

            await expect(promise).rejects.toThrow('aborted')
            expect(c.listenerCount('data')).toBe(0)
        })

        test('aborting an already-settled write is a harmless no-op (idempotent settle)', async () => {
            const { p, c } = setup()

            const controller = new AbortController()
            const promise = p.write(CP, Buffer.from([0x00]), { signal: controller.signal })
            await Promise.resolve()
            await Promise.resolve()

            const response = Buffer.from([0x80, 0x00, 0x01])
            c.emit('data', response)
            await expect(promise).resolves.toEqual(response)

            // aborting after the fact must not throw or double-settle
            expect(() => controller.abort()).not.toThrow()
        })

        // FIXES_BACKLOG #25 - the critical regression test: the old implementation cleaned up via
        // `c.removeAllListeners('data')`, called *inside* the listener itself - so an abandoned write
        // that is later cancelled/settled would wipe out every listener on the shared characteristic,
        // including a concurrent, still-legitimately-pending write's own listener. The fix removes
        // only the calling write's own specific listener reference, so a later, unrelated write on the
        // same (reused) characteristic is completely unaffected by an earlier one being abandoned.
        test('an earlier abandoned write does not steal or discard a later, unrelated write\'s real response', async () => {
            const { p, c } = setup()

            // attempt A: issued first, then abandoned (its owning caller gave up and cancelled it) -
            // mirrors establishControl()'s dedicated timeout cancelling an in-flight requestControl()
            const controllerA = new AbortController()
            const writeA = p.write(CP, Buffer.from([0x00]), { timeout: 5000, signal: controllerA.signal })
            await Promise.resolve()
            await Promise.resolve()

            // attempt B: a second, later write on the very same characteristic object - e.g. a fresh
            // pairing generation's own RequestControl retry, while A's is still (about to be) abandoned
            const writeB = p.write(CP, Buffer.from([0x00]))
            await Promise.resolve()
            await Promise.resolve()

            // both writes are genuinely concurrent at this point - two listeners on the one shared `c`
            expect(c.listenerCount('data')).toBe(2)

            // A gives up (its dedicated timeout fires) - this must remove *only* A's own listener
            controllerA.abort()
            await expect(writeA).rejects.toThrow('aborted')
            expect(c.listenerCount('data')).toBe(1)

            // the real response now arrives - meant for B, the only genuinely outstanding request
            const realResponse = Buffer.from([0x80, 0x00, 0x01])
            c.emit('data', realResponse)

            // B must resolve with the real response - not be silently discarded by A's cleanup
            await expect(writeB).resolves.toEqual(realResponse)
            expect(c.listenerCount('data')).toBe(0)
        })

    })

    describe('discoverAllCharacteristics/discoverSomeCharacteristics cache invalidation (FIXES_BACKLOG #30)', () => {

        const IBD = '2AD2'   // FTMS Indoor Bike Data
        const FMS = '2ADA'   // FTMS FM Status
        const CP2 = '2AD9'   // FTMS Control Point - never found in any round in the real repro

        const setup = () => {
            const announcement: any = { peripheral: { id: 'p1', address: 'AA:BB:CC:DD:EE:FF' }, serviceUUIDs: [] }
            const p: any = new BlePeripheral(announcement)
            p.connected = true
            p.logEvent = () => {}

            const peripheral = {
                id: 'p1',
                address: 'AA:BB:CC:DD:EE:FF',
                discoverSomeServicesAndCharacteristicsAsync: vi.fn(),
            }
            p.getPeripheral = () => peripheral

            return { p, peripheral }
        }

        test('discoverAllCharacteristics: a characteristic present in an earlier round and absent from a later one is dropped from the cache', async () => {
            const { p, peripheral } = setup()

            const ibd = new MockChar(IBD)
            const fms = new MockChar(FMS)

            // round 1: both found, get cached
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd, fms] })
            await p.discoverAllCharacteristics()
            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
            expect(p.getRawCharacteristic(FMS)).toBe(fms)

            // round 2, same live connection: only IBD reconfirmed, FMS is no longer returned
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd] })
            await p.discoverAllCharacteristics()

            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
            expect(p.getRawCharacteristic(FMS)).toBeUndefined()
        })

        test('discoverAllCharacteristics: a characteristic that stays present across rounds is unaffected', async () => {
            const { p, peripheral } = setup()

            const ibd = new MockChar(IBD)

            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd] })
            await p.discoverAllCharacteristics()

            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd] })
            await p.discoverAllCharacteristics()

            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
        })

        test('discoverAllCharacteristics: a first-ever discovery still populates the cache normally', async () => {
            const { p, peripheral } = setup()

            const ibd = new MockChar(IBD)
            const fms = new MockChar(FMS)
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd, fms] })

            expect(p.getRawCharacteristic(IBD)).toBeUndefined()

            const found = await p.discoverAllCharacteristics()

            expect(found).toEqual([IBD, FMS])
            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
            expect(p.getRawCharacteristic(FMS)).toBe(fms)
        })

        test('discoverAllCharacteristics: reproduces the real repro - a characteristic never found in any round (Control Point) stays absent, while a reconfirmed-then-dropped one (FM Status) is removed', async () => {
            const { p, peripheral } = setup()

            const ibd = new MockChar(IBD)
            const fms = new MockChar(FMS)

            // round 1: empty
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [] })
            await p.discoverAllCharacteristics()

            // round 2: real characteristics found and cached, CP2 still absent
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd, fms] })
            await p.discoverAllCharacteristics()
            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
            expect(p.getRawCharacteristic(FMS)).toBe(fms)

            // round 3 (lazily triggered by write() looking for CP2): empty again
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [] })
            await p.discoverAllCharacteristics()

            expect(p.getRawCharacteristic(IBD)).toBeUndefined()
            expect(p.getRawCharacteristic(FMS)).toBeUndefined()
            expect(p.getRawCharacteristic(CP2)).toBeUndefined()
        })

        test('discoverSomeCharacteristics: a requested characteristic absent from a fresh targeted discovery is dropped from the cache', async () => {
            const { p, peripheral } = setup()

            const ibd = new MockChar(IBD)
            const fms = new MockChar(FMS)

            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd, fms] })
            await p.discoverSomeCharacteristics([IBD, FMS])
            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
            expect(p.getRawCharacteristic(FMS)).toBe(fms)

            // same connection, later targeted re-discovery of the same two UUIDs: FMS no longer found
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd] })
            await p.discoverSomeCharacteristics([IBD, FMS])

            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
            expect(p.getRawCharacteristic(FMS)).toBeUndefined()
        })

        test('discoverSomeCharacteristics: a characteristic that stays present across rounds is unaffected', async () => {
            const { p, peripheral } = setup()

            const ibd = new MockChar(IBD)

            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd] })
            await p.discoverSomeCharacteristics([IBD])

            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd] })
            await p.discoverSomeCharacteristics([IBD])

            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
        })

        test('discoverSomeCharacteristics: a first-ever discovery still populates the cache normally', async () => {
            const { p, peripheral } = setup()

            const ibd = new MockChar(IBD)
            peripheral.discoverSomeServicesAndCharacteristicsAsync.mockResolvedValueOnce({ services: [], characteristics: [ibd] })

            expect(p.getRawCharacteristic(IBD)).toBeUndefined()

            const found = await p.discoverSomeCharacteristics([IBD])

            expect(found).toEqual([IBD])
            expect(p.getRawCharacteristic(IBD)).toBe(ibd)
        })

    })

})
