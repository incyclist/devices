import { sleep } from '../../utils/utils'
import { IBleInterface } from '../types'
import BleFmAdapter from './adapter'
import BleFitnessMachineDevice from './sensor'
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

        let adapter: BleFmAdapter
        let iv

        const setupMocks= (a)=>{
            a.getSensor = jest.fn( ()=> { return sensor})            
            a.getBle = jest.fn().mockReturnValue(ble)
            a.requestControlRetryDelay = 10;
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
            expect(establishControl).not.toHaveBeenCalled()
            
        })


    })
})