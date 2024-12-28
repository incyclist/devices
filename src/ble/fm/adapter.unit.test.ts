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
    
    })    

    describe('start',()=>{

        let sensor  = new BleFitnessMachineDevice(null)
        let ble: Partial<IBleInterface<any>> = {
            once:jest.fn(),
            pauseLogging: jest.fn(),
            resumeLogging: jest.fn(),
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