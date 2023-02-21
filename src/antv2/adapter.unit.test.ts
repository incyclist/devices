import { IncyclistCapability } from '../types/capabilities'
import AntAdapter from './adapter'
import { AntDeviceSettings } from './types';

describe( 'adapter', ()=>{
    let cs ;
    beforeAll( ()=>{
        cs = AntAdapter.prototype.createSensor
        AntAdapter.prototype.createSensor = jest.fn()
    })

    afterAll( ()=> {
        AntAdapter.prototype.createSensor = cs
    })

    describe('constructor',()=>{


        test('typical settings, empty props',()=>{
            const settings = {       
                name: 'XXXX',
                selected: true,
                protocol: 'Ant',
                deviceID: '2606',
                profile: 'Heartrate Monitor',
                interface: 'ant'
            } as AntDeviceSettings
            const adapter = new AntAdapter(settings,{})

            // simple getters
            expect(adapter.isStarted()).toBeFalsy()
            expect(adapter.isStopped()).toBeFalsy()
            expect(adapter.isPaused()).toBeFalsy()
            expect(adapter.getInterface()).toBe('ant')

        })

        test('incorrect interface',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ble'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntAdapter(settings,{})
            }
            catch(err) {
                error = err;
            }
            expect(adapter).toBeUndefined()
            expect(error).toBeDefined()


        })

    })


    describe('udpateData',()=>{

    })

    describe('check',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntAdapter({deviceID: '2606',profile: 'Heartrate Monitor',interface: 'ant'})
            adapter.start = jest.fn()
        })

        test('start ok',async ()=>{
            adapter.start.mockResolvedValue(new Error('could not start device, reason:timeout'))
            const res = await adapter.check()
            expect(res).toBeTruthy()

        })

        test('start fails',async ()=>{
            adapter.start.mockRejectedValue(true)
            const res = await adapter.check()
            expect(res).toBeFalsy()
        })

        
    })


    describe('start',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntAdapter({deviceID: '2606',profile: 'Heartrate Monitor',interface: 'ant'})

            adapter.onDataFn = jest.fn()
            adapter.startDataTimeoutCheck = jest.fn()
            adapter.emit = jest.fn()
            adapter.dataMsgCount = 1
            adapter.connect = jest.fn()
            adapter.ant = {
                startSensor: jest.fn() 
            }
            adapter.stop = jest.fn()
            adapter.resetData = jest.fn()
            adapter.waitForData = jest.fn()
            
        })


        test('normal start',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.waitForData.mockResolvedValue(true)
            
            
            const started = await adapter.start()         
            expect(adapter.started).toBeTruthy()   
            expect(started).toBeTruthy()   
        })

        test('already started',async ()=>{            
            adapter.started = true;

            const started = await adapter.start()         
            expect(adapter.started).toBeTruthy()   
            expect(started).toBeTruthy()   
            expect(adapter.ant.startSensor).not.toHaveBeenCalled()
        })

        test('connect fails',async ()=>{
            adapter.connect.mockResolvedValue(false)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.waitForData.mockResolvedValue(true)

            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:could not connect')
            expect(adapter.started).toBeFalsy()   
        })

        test('start timeout',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.stop.mockResolvedValue(true)
            adapter.waitForData.mockRejectedValue( new Error('something'))
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:timeout')
            expect(adapter.started).toBeFalsy()   
        })

        test('start sensor fails once',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor = jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)
            adapter.stop.mockResolvedValue(true)
            adapter.startupRetryPause=10;
            adapter.waitForData.mockResolvedValue(true)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(error).toBeUndefined()              
            expect(adapter.started).toBeTruthy()   
        })

    })

    describe('check',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntAdapter({deviceID: '2606',profile: 'Heartrate Monitor',interface: 'ant'})
            adapter.start = jest.fn()
        })

        test('start ok',async ()=>{
            adapter.start.mockResolvedValue(new Error('could not start device, reason:timeout'))
            const res = await adapter.check()
            expect(res).toBeTruthy()

        })

        test('start fails',async ()=>{
            adapter.start.mockRejectedValue(true)
            const res = await adapter.check()
            expect(res).toBeFalsy()
        })

        
    })

    describe('stop',()=>{
        
    })

})  