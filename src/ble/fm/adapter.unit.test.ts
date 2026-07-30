import { sleep } from '../../utils/utils'
import { IBleInterface } from '../types'
import BleFmAdapter from './adapter'
import BleFitnessMachineDevice from './sensor'
import { IncyclistCapability } from '../../types/index'
describe('BleFmAdapter',()=>{
    describe('isEqual',()=>{

        test('name only equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'1', protocol:'fm'})
            expect(res).toBeTruthy()
        }) 
        test('name only not equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'2', protocol:'fm'})
            expect(res).toBeFalsy()
        }) 
        test('name and address - one is equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1',address:'1111', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'2',address:'1111', protocol:'fm'})
            expect(res).toBeTruthy()
        })

        // FIXES_BACKLOG #14: two wifi devices sharing the same (generic) name must not be treated
        // as equal just because the name matches - once both sides carry an address, it alone decides
        test('same name, different address - not equal (name-only match is no longer sufficient)',()=>{
            const A = new BleFmAdapter({interface:'wifi', name:'Volt',address:'10.0.0.5', protocol:'fm'})
            const res = A.isEqual({interface:'wifi', name:'Volt',address:'10.0.0.9', protocol:'fm'})
            expect(res).toBeFalsy()
        })

        // Regression check: unlike wifi addresses (IPs, which can change e.g. on a DHCP lease
        // renewal), BLE addresses are stable MAC addresses - two different BLE addresses are
        // *always* two different physical devices, never the "same device, address changed" case.
        // This adapter is shared between ble and wifi (see FIXES_BACKLOG #14), so isEqual() must
        // apply the same "address alone decides, once both sides have one" rule to both interfaces -
        // confirmed explicitly here for interface:'ble', not just interface:'wifi' above.
        test('BLE: same name, different address - not equal (a physical BLE device cannot change its MAC address)',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'HRM-Dual',address:'AA:BB:CC:DD:EE:01', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'HRM-Dual',address:'AA:BB:CC:DD:EE:02', protocol:'fm'})
            expect(res).toBeFalsy()
        })

        test('id present on both sides is decisive, even if address differs',()=>{
            const A = new BleFmAdapter({interface:'wifi', name:'Volt',address:'10.0.0.5',id:'SN-1', protocol:'fm'})
            const res = A.isEqual({interface:'wifi', name:'Volt',address:'10.0.0.9',id:'SN-1', protocol:'fm'})
            expect(res).toBeTruthy()
        })

        test('different protocol is never equal, regardless of name/address/id',()=>{
            const A = new BleFmAdapter({interface:'wifi', name:'Volt',address:'10.0.0.5', protocol:'fm'})
            const res = A.isEqual({interface:'wifi', name:'Volt',address:'10.0.0.5', protocol:'wahoo'} as any)
            expect(res).toBeFalsy()
        })

    })

    describe('updateSettings (FIXES_BACKLOG #14)',()=>{

        test('a freshly observed address always overwrites a stale persisted one',()=>{
            const A = new BleFmAdapter({interface:'wifi', name:'Volt',address:'10.0.0.5', protocol:'fm'})
            const peripheral: any = { getInfo: jest.fn().mockReturnValue({ id:'10005', address:'10.0.0.9', name:'Volt'}) }

            ;(A as any).updateSettings(peripheral)

            expect(A.getSettings()).toMatchObject({address:'10.0.0.9'})
        })

        test('keeps the existing address when the peripheral reports none',()=>{
            const A = new BleFmAdapter({interface:'wifi', name:'Volt',address:'10.0.0.5', protocol:'fm'})
            const peripheral: any = { getInfo: jest.fn().mockReturnValue({ id:undefined, address:undefined, name:'Volt'}) }

            ;(A as any).updateSettings(peripheral)

            expect(A.getSettings()).toMatchObject({address:'10.0.0.5'})
        })
    })

    describe('start',()=>{

        let sensor  = new BleFitnessMachineDevice(null)
        let ble: Partial<IBleInterface<any>> = {
            once:jest.fn(),
            pauseLogging: jest.fn(),
            resumeLogging: jest.fn(),
            removeListener:jest.fn(),
            connect: jest.fn().mockResolvedValue(true),
            createPeripheralFromSettings: jest.fn(),
            waitForPeripheral: jest.fn().mockResolvedValue({})
        }
       
        sensor.requestControl= jest.fn().mockResolvedValue(true)
        sensor.subscribe= jest.fn().mockResolvedValue(true)
        sensor.setCrr= jest.fn()
        sensor.setCw= jest.fn()
        sensor['_features']= {fitnessMachine:0, targetSettings:0}
        sensor.hasPeripheral= jest.fn().mockReturnValue(true)
        sensor.reset= jest.fn()
        sensor.startSensor= jest.fn().mockReturnValue(true)
        sensor.stopSensor= jest.fn().mockReturnValue(true)
        sensor.setSlope = jest.fn().mockReturnValue(true)
        sensor.setTargetPower = jest.fn().mockResolvedValue(true)
        sensor.startRequest = jest.fn().mockResolvedValue(true)

        let adapter: BleFmAdapter
        let iv

        const setupMocks= (a)=>{
            a.getSensor = jest.fn( ()=> { return sensor})
            a.getBle = jest.fn().mockReturnValue(ble)
            a.requestControlRetryDelay = 10;
            // keep the dedicated RequestControl timeout short in tests (FIXES_BACKLOG #22), so a
            // scenario where control is never granted doesn't leave a real 10s timer running in the
            // background after the test has already finished (the outer/shared pairing timeout used in
            // most of these tests is much shorter and will still win the race where relevant)
            a.requestControlTimeout = 300;
            if (process.env.DEBUG) {
                a.logger = {logEvent:(message)=>console.log( new Date().toISOString(),{...message})}
                sensor.logEvent = a.logger.logEvent
            }
            
        }

        beforeEach( ()=>{
            adapter = new BleFmAdapter({interface:'ble', name:'1',address:'1111', protocol:'fm'})
        })

        afterEach( async ()=>{
            if (iv)
                clearInterval(iv)

            await adapter.stop()
        })

        test('normal successfull start',async ()=>{
            
            setupMocks(adapter)
            iv = setInterval( ()=> {
                sensor.emit('data',{power:0})
            },10)
            await adapter.start({timeout:200})
            expect(adapter.started).toBeTruthy()

            // expected calls to sensor
            expect(sensor.startSensor).toHaveBeenCalledWith()
            expect(sensor.setCrr).toHaveBeenCalledWith(0.0036)
            expect(sensor.setCw).toHaveBeenCalledWith(0.35)
            expect(sensor.requestControl).toHaveBeenCalledWith()
            expect(sensor.setSlope).toHaveBeenCalledWith(0)

            // expected calls to interface
            expect(ble.connect).toHaveBeenCalled()
            expect(ble.resumeLogging).not.toHaveBeenCalled()

            jest.clearAllMocks ()

            await adapter.pause()
            expect(ble.pauseLogging).toHaveBeenCalled()

            await adapter.resume()
            expect(ble.resumeLogging).toHaveBeenCalled()
        })

        test('failure: no data',async ()=>{
            setupMocks(adapter)
            await adapter.start({timeout:200})
            expect(adapter.started).toBeFalsy()
            
        })
        test('failure: could not establish control',async ()=>{
            sensor.requestControl= jest.fn()
            setupMocks(adapter)
            iv = setInterval( ()=> {
                sensor.emit('data',{power:0})
            },10)

            await adapter.start({timeout:200})
            expect(adapter.started).toBeFalsy()
        })

        test('stop during start',async ()=>{
            sensor.requestControl= jest.fn()
            setupMocks(adapter)

            const establishControl = jest.spyOn(adapter as any,'establishControl')
            const waitForData = jest.spyOn(adapter as any,'waitForInitialData')
            adapter.start()
            await sleep(100)
            await adapter.stop()

            expect(adapter.started).toBeFalsy()
            expect(waitForData).toHaveBeenCalled()
            // FIXES_BACKLOG #22: checkCapabilities()/initControl() now run *before* waitForInitialData(),
            // so establishControl() is reached (and starts retrying RequestControl) before the stop()
            // call interrupts it - unlike before the reorder, where a stop during the (then-first)
            // data-wait meant establishControl() was never reached at all. It must still resolve
            // gracefully (no throw, no control granted) once stopped, rather than fail pairing.
            expect(establishControl).toHaveBeenCalled()
        })


    })

    describe('start - FTMS Control Point handshake (FIXES_BACKLOG #22)',()=>{

        let sensor: BleFitnessMachineDevice
        let ble: Partial<IBleInterface<any>>
        let adapter: BleFmAdapter
        let iv

        const setupMocks = (a) => {
            a.getSensor = jest.fn( ()=> sensor)
            a.getBle = jest.fn().mockReturnValue(ble)
            a.requestControlRetryDelay = 10
        }

        const emitDataContinuously = () => {
            iv = setInterval( ()=> { sensor.emit('data',{power:0}) }, 10)
        }

        beforeEach( ()=>{
            sensor = new BleFitnessMachineDevice(null)
            sensor.subscribe = jest.fn().mockResolvedValue(true)
            sensor.setCrr = jest.fn()
            sensor.setCw = jest.fn()
            sensor.hasPeripheral = jest.fn().mockReturnValue(true)
            sensor.reset = jest.fn()
            sensor.startSensor = jest.fn().mockReturnValue(true)
            sensor.stopSensor = jest.fn().mockReturnValue(true)
            sensor.setSlope = jest.fn().mockReturnValue(true)
            sensor.setTargetPower = jest.fn().mockResolvedValue(true)

            ble = {
                once: jest.fn(),
                pauseLogging: jest.fn(),
                resumeLogging: jest.fn(),
                removeListener: jest.fn(),
                connect: jest.fn().mockResolvedValue(true),
                createPeripheralFromSettings: jest.fn(),
                waitForPeripheral: jest.fn().mockResolvedValue({})
            }

            adapter = new BleFmAdapter({interface:'ble', name:'1', address:'1111', protocol:'fm'})
        })

        afterEach( async ()=>{
            if (iv)
                clearInterval(iv)
            await adapter.stop()
        })

        test('controllable device: RequestControl never granted fails pairing fast, bounded by the dedicated control timeout - not the (much larger) default data-wait timeout',async ()=>{
            sensor['_features'] = {fitnessMachine:0, targetSettings:0}   // no downgrade info -> stays controllable
            sensor.requestControl = jest.fn().mockResolvedValue(false)
            sensor.startRequest = jest.fn().mockResolvedValue(true)
            setupMocks(adapter)
            ;(adapter as any).requestControlTimeout = 100   // dedicated control timeout, kept short for the test
            emitDataContinuously()

            const tsStart = Date.now()
            // no startProps.timeout given -> outer pairing timeout falls back to getDefaultStartupTimeout() (30s);
            // if the failure were still bounded by that (the pre-fix bug), this test would need to wait 30s
            const result = await adapter.start()
            const duration = Date.now() - tsStart

            expect(result).toBe(false)
            expect(adapter.started).toBeFalsy()
            expect(duration).toBeLessThan(2000)

            // must fail fast, before ever attempting the non-fatal StartOrResume handshake or the
            // existing target-setting write
            expect(sensor.startRequest).not.toHaveBeenCalled()
            expect(sensor.setSlope).not.toHaveBeenCalled()
        })

        test('controllable device: RequestControl succeeds but StartOrResume fails - not fatal, pairing proceeds normally',async ()=>{
            sensor['_features'] = {fitnessMachine:0, targetSettings:0}
            sensor.requestControl = jest.fn().mockResolvedValue(true)
            sensor.startRequest = jest.fn().mockRejectedValue(new Error('write failed'))
            setupMocks(adapter)
            emitDataContinuously()

            const result = await adapter.start({timeout:2000})

            expect(result).toBe(true)
            expect(adapter.started).toBeTruthy()
            expect(sensor.requestControl).toHaveBeenCalled()
            expect(sensor.startRequest).toHaveBeenCalled()
        })

        test('downgraded (power-meter-only) device: RequestControl rejected/never granted is only logged, never fails pairing',async ()=>{
            // features explicitly report no settable target -> checkCapabilities() downgrades to Power Meter
            sensor['_features'] = {fitnessMachine:0, targetSettings:0, setPower:false, setSlope:false, setResistance:false}
            sensor.requestControl = jest.fn().mockRejectedValue(new Error('control not permitted'))
            sensor.startRequest = jest.fn()
            setupMocks(adapter)
            emitDataContinuously()

            const result = await adapter.start({timeout:2000})

            expect(result).toBe(true)
            expect(adapter.started).toBeTruthy()
            expect(adapter.hasCapability(IncyclistCapability.Control)).toBeFalsy()  // sanity check: genuinely downgraded

            expect(sensor.requestControl).toHaveBeenCalled()
            // best-effort only: a rejected RequestControl must never block/fail waitForInitialData,
            // and (since RequestControl itself failed) StartOrResume is not attempted either
            expect(sensor.startRequest).not.toHaveBeenCalled()
        })

        test('checkCapabilities() runs before waitForInitialData() in the overall start sequence',async ()=>{
            sensor['_features'] = {fitnessMachine:0, targetSettings:0}
            sensor.requestControl = jest.fn().mockResolvedValue(true)
            sensor.startRequest = jest.fn().mockResolvedValue(true)
            setupMocks(adapter)
            emitDataContinuously()

            const checkCapabilities = jest.spyOn(adapter as any,'checkCapabilities')
            const waitForData = jest.spyOn(adapter as any,'waitForInitialData')

            await adapter.start({timeout:2000})

            expect(checkCapabilities).toHaveBeenCalled()
            expect(waitForData).toHaveBeenCalled()
            expect(checkCapabilities.mock.invocationCallOrder[0]).toBeLessThan(waitForData.mock.invocationCallOrder[0])
        })

    })

    // FIXES_BACKLOG #23: BleAdapter.start()/stop() must genuinely serialize concurrent calls on the
    // same adapter instance - real-device validation against a controllable FTMS trainer ("Volt")
    // showed the entire checkCapabilities()/establishControl()/requestControl() sequence firing
    // twice, ~4ms apart, producing two concurrent RequestControl BLE writes that collided at the
    // GATT layer.
    describe('start/stop concurrency (FIXES_BACKLOG #23)',()=>{

        let sensor: BleFitnessMachineDevice
        let ble: Partial<IBleInterface<any>>
        let adapter: BleFmAdapter
        let iv

        const setupMocks = (a) => {
            a.getSensor = jest.fn( ()=> sensor)
            a.getBle = jest.fn().mockReturnValue(ble)
            a.requestControlRetryDelay = 10
        }

        const emitDataContinuously = () => {
            iv = setInterval( ()=> { sensor.emit('data',{power:0}) }, 10)
        }

        beforeEach( ()=>{
            sensor = new BleFitnessMachineDevice(null)
            sensor['_features'] = {fitnessMachine:0, targetSettings:0}
            sensor.subscribe = jest.fn().mockResolvedValue(true)
            sensor.setCrr = jest.fn()
            sensor.setCw = jest.fn()
            sensor.hasPeripheral = jest.fn().mockReturnValue(true)
            sensor.reset = jest.fn()
            sensor.startSensor = jest.fn().mockReturnValue(true)
            sensor.stopSensor = jest.fn().mockReturnValue(true)
            sensor.setSlope = jest.fn().mockReturnValue(true)
            sensor.setTargetPower = jest.fn().mockResolvedValue(true)
            sensor.requestControl = jest.fn().mockResolvedValue(true)
            sensor.startRequest = jest.fn().mockResolvedValue(true)

            ble = {
                once: jest.fn(),
                pauseLogging: jest.fn(),
                resumeLogging: jest.fn(),
                removeListener: jest.fn(),
                connect: jest.fn().mockResolvedValue(true),
                createPeripheralFromSettings: jest.fn(),
                waitForPeripheral: jest.fn().mockResolvedValue({})
            }

            adapter = new BleFmAdapter({interface:'ble', name:'1', address:'1111', protocol:'fm'})
        })

        afterEach( async ()=>{
            if (iv)
                clearInterval(iv)
            await adapter.stop()
        })

        test('overlapping start() calls converge on one result - no duplicate startAdapter()/GATT work',async ()=>{
            setupMocks(adapter)
            emitDataContinuously()

            const p1 = adapter.start({timeout:2000})
            const p2 = adapter.start({timeout:2000})

            const [r1,r2] = await Promise.all([p1,p2])

            expect(r1).toBe(true)
            expect(r2).toBe(true)
            // the second start() must have converged onto the first's in-flight run, rather than
            // launching its own duplicate startAdapter() - so every GATT-level operation below
            // must only have happened once
            expect(ble.connect).toHaveBeenCalledTimes(1)
            expect(sensor.startSensor).toHaveBeenCalledTimes(1)
            expect(sensor.requestControl).toHaveBeenCalledTimes(1)
        })

        test('start() called while a stop() is in flight waits for the REAL completion of that stop (not just an internal flag flip) before proceeding',async ()=>{
            setupMocks(adapter)
            emitDataContinuously()

            let resolveConnect: (v:boolean)=>void
            const connectDeferred = new Promise<boolean>( resolve => { resolveConnect = resolve })
            let connectCallCount = 0
            ble.connect = jest.fn().mockImplementation( ()=> {
                connectCallCount++
                return connectCallCount===1 ? connectDeferred : Promise.resolve(true)
            })

            // p1 gets stuck mid-flight, awaiting connect() - simulates a still in-flight GATT
            // operation (e.g. an already-dispatched RequestControl write awaiting its response)
            const p1 = adapter.start({timeout:5000})
            await sleep(20)
            expect(connectCallCount).toBe(1)

            // stop() while p1 is still genuinely running underneath
            const stopPromise = adapter.stop()
            await sleep(20)

            // InteruptableTask's internal isRunning flag has already flipped to false by now (it
            // does so synchronously) - but the real work (still awaiting connectDeferred) has not
            // finished. A second start() must wait for stop()'s genuine completion, not this flag.
            const p2 = adapter.start({timeout:5000})
            await sleep(30)

            expect(connectCallCount).toBe(1)   // p2 must NOT have proceeded to a fresh connect() yet

            // let the first run's connect() (and the whole chain depending on it) finally settle
            resolveConnect(true)

            await stopPromise
            await Promise.all([p1,p2])

            expect(connectCallCount).toBeGreaterThanOrEqual(2)   // p2 eventually did proceed
        })

        test('concurrent stop() calls dedupe - teardown logic only runs once',async ()=>{
            setupMocks(adapter)
            emitDataContinuously()

            await adapter.start({timeout:2000})
            expect(adapter.started).toBeTruthy()

            const s1 = adapter.stop()
            const s2 = adapter.stop()

            const [r1,r2] = await Promise.all([s1,s2])

            expect(r1).toBe(r2)
            expect(sensor.reset).toHaveBeenCalledTimes(1)
        })

    })
})