import exp from 'constants'
import { IncyclistCapability } from '../../types/capabilities'
import { sleep } from '../../utils/utils'
import { AntDeviceSettings } from '../types'
import AntHrAdapter from './adapter'

describe( 'ANT HR adapter', ()=>{
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
            const adapter = new AntHrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('XXXX')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.HeartRate])

        })

        test('minimal settings',()=>{
            const settings:AntDeviceSettings = {       
                deviceID: '2606',
                profile: 'HR',
                interface: 'ant'
            }  as AntDeviceSettings
            const adapter = new AntHrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+HR 2606')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.HeartRate])

        })
        test('legacy settings',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Heartrate Monitor',
                interface: 'ant',
                protocol: 'Ant'

            } as AntDeviceSettings
            const adapter = new AntHrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+HR 2606')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.HeartRate])

        })

        test('incorrect profile',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ant'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntHrAdapter(settings,{})
            }
            catch(err) {
                error = err;
            }
            expect(adapter).toBeUndefined()
            expect(error).toBeDefined()
        })
        test('legacy: incorrect profile',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ant',
                protocol: 'Ant'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntHrAdapter(settings,{})
            }
            catch(err) {
                error = err;
            }
            expect(adapter).toBeUndefined()
            expect(error).toBeDefined()
        })


    })

    describe('getUniqueName',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})

        })

        test('no data (yet)',()=>{
            expect(adapter.getUniqueName()).toBe('Ant+HR 2606')
        })

        test('has received HR data',()=>{
            adapter.deviceData.ComputedHeartRate = 123
            expect(adapter.getUniqueName()).toBe('Ant+HR 2606')
        })

        test('has received ManId',()=>{
            adapter.deviceData.ManId = 123
            expect(adapter.getUniqueName()).toBe('Polar HR 2606')
        })

        test('has received ManId and HR data',()=>{
            adapter.deviceData.ManId = 123
            adapter.deviceData.ComputedHeartRate = 180
            expect(adapter.getUniqueName()).toBe('Polar HR 2606')
        })

        test('name is in settings',()=>{
            adapter.settings.name = 'Emma'
            adapter.deviceData.ManId = 123
            adapter.deviceData.ComputedHeartRate = 180
            expect(adapter.getUniqueName()).toBe('Emma')
        })

    })


    describe('getDisplayName',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})

        })

        test('no data (yet)',()=>{
            expect(adapter.getDisplayName()).toBe('Ant+HR 2606')
        })

        test('has received HR data',()=>{
            adapter.deviceData.ComputedHeartRate = 123
            expect(adapter.getDisplayName()).toBe('Ant+HR 2606 (123)')
        })

        test('has received ManId',()=>{
            adapter.deviceData.ManId = 123
            expect(adapter.getDisplayName()).toBe('Polar HR 2606')
        })

        test('has received ManId and HR data',()=>{
            adapter.deviceData.ManId = 123
            adapter.deviceData.ComputedHeartRate = 180
            expect(adapter.getDisplayName()).toBe('Polar HR 2606 (180)')
        })

    })
    describe('onDeviceData',()=>{
        let adapter;

        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})
            adapter.deviceData = {DeviceID:2606}
            adapter.started = true;
            adapter.paused = false
            adapter.dataMsgCount = 123

            adapter.onDataFn = jest.fn()
            adapter.startDataTimeoutCheck = jest.fn()
            jest.spyOn(adapter,'emitData')
            adapter.emit = jest.fn()
        })

        test('initial data - not started',()=>{
            adapter.deviceData = {DeviceID:'2606'}
            adapter.started = false;
            adapter.paused = false
            adapter.lastDataTS = undefined;
            adapter.lastUpdate = undefined
            adapter.dataMsgCount = 0

            adapter.onDeviceData({DeviceID:2606, ComputedHeartRate:60})
            expect(adapter.deviceData).toMatchObject({DeviceID:2606})
            expect(adapter.emit).toHaveBeenCalledWith('data',expect.objectContaining({deviceID:'2606'}),expect.objectContaining({heartrate:60}))
            expect(adapter.lastUpdate).toBeDefined()
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()

        })


        test('initial data - only heartrate',()=>{
            adapter.started = true;
            adapter.dataMsgCount = 0

            adapter.onDeviceData({DeviceID:2606, ComputedHeartRate:60})

            expect(adapter.deviceData).toMatchObject({DeviceID:2606, ComputedHeartRate:60})
            expect(adapter.emitData).toHaveBeenCalledWith(({heartrate:60,timestamp:expect.anything()}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
        })

        test('initial data - includes ManId',()=>{
            adapter.dataMsgCount = 0

            adapter.onDeviceData({DeviceID:2606, ComputedHeartRate:60, ManId:89})

            expect(adapter.deviceData).toMatchObject({DeviceID:2606, ComputedHeartRate:60})
            expect(adapter.emitData).toHaveBeenCalledWith(({heartrate:60,timestamp:expect.anything()}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
            expect(adapter.emit).toHaveBeenCalledWith('device-info',expect.objectContaining({deviceID:'2606'}),expect.objectContaining({manufacturer:'Tacx'}))
        })

        test('data update new alue',()=>{
            adapter.deviceData = {DeviceID:2606, ComputedHeartRate:60}
            adapter.ivDataTimeout = 123
            adapter.dataMsgCount = 1

            adapter.onDeviceData({DeviceID:2606, ComputedHeartRate:61, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:2606, ComputedHeartRate:61,ManId:89})
            expect(adapter.emitData).toHaveBeenCalledWith(({heartrate:61,timestamp:expect.anything()}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(2)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()            
        })

        test('data update same alue',()=>{
            adapter.deviceData = {DeviceID:2606, ComputedHeartRate:60}
            adapter.dataMsgCount = 1

            adapter.onDeviceData({DeviceID:2606, ComputedHeartRate:60, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:2606, ComputedHeartRate:60,ManId:89})
            expect(adapter.emitData).toHaveBeenCalledWith(({heartrate:60,timestamp:expect.anything()}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(2)
        })

        test('data update - last emit was more frequent than limit',()=>{
            adapter.deviceData = {DeviceID:'2606', ComputedHeartRate:60}
            adapter.dataMsgCount = 1
            adapter.isUpdateWithinFrequency = jest.fn().mockReturnValue(false)

            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:61, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', ComputedHeartRate:61,ManId:89})
            expect(adapter.emitData).not.toHaveBeenCalled()
            
        })

        test('data update - paused',()=>{
            adapter.deviceData = {DeviceID:2606, ComputedHeartRate:60}
            adapter.paused = true

            adapter.onDeviceData({DeviceID:2606, ComputedHeartRate:99, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:2606, ComputedHeartRate:99,ManId:89})
            expect(adapter.emitData).not.toHaveBeenCalled()
            
        })

    })

    describe('mapToAdapterData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})
            adapter.startDataTimeoutCheck = jest.fn()
            adapter.data={}

        })

        test('receiving only device information',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606})
            expect(adapter.data).toEqual({})
        })

        test('receiving a heartrate, multiple times',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,ComputedHeartRate:60})
            expect(adapter.data).toEqual({heartrate:60,timestamp:expect.anything()})

            adapter.mapToAdapterData({ManId:89,DeviceID:2606,ComputedHeartRate:90,SerialNumber:10})
            expect(adapter.data).toEqual({heartrate:90,timestamp:expect.anything()})
        })

        test('receiving a heartrate, then a record without heartrate',async ()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,ComputedHeartRate:60})
            expect(adapter.data).toEqual({heartrate:60,timestamp:expect.anything()})
            const ts = adapter.data.timestamp

            await sleep(10)

            adapter.mapToAdapterData({ManId:89,DeviceID:2606})
            expect(adapter.data).toEqual({heartrate:60,timestamp:ts})
        })

    })


    describe('hasData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})
            adapter.startDataTimeoutCheck = jest.fn() // mock to avoid open handle at end of test
        })

        test('receiving only device information',()=>{
            adapter.deviceData={ManId:89,DeviceID:2606}
            expect(adapter.hasData()).toBeFalsy()
        })

        test('receiving a heartrate',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,ComputedHeartRate:60}
            expect(adapter.hasData()).toBeTruthy()
        })

        test('receiving a heartrate=0',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,ComputedHeartRate:0}
            expect(adapter.hasData()).toBeTruthy()
        })

    })

    describe('start',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})

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

            adapter.connect=jest.fn().mockResolvedValue(true)
            adapter.startSensor=jest.fn().mockResolvedValue(true)
            adapter.waitForData=jest.fn().mockResolvedValue(true)
            adapter.getDefaultReconnectDelay = jest.fn().mockReturnValue(1)

        })


        test('normal start',async ()=>{
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

        test('paused',async ()=>{            
            adapter.started = true;
            adapter.paused  = true

            const started = await adapter.start()         
            expect(adapter.started).toBeTruthy()   
            expect(adapter.isPaused()).toBeFalsy()   
            expect(started).toBeTruthy()   
            expect(adapter.ant.startSensor).not.toHaveBeenCalled()
        })

        test('connect fails',async ()=>{
            adapter.connect.mockResolvedValue(false)
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
            adapter.startSensor = jest.fn( async()=> { await sleep(500); return true})
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:timeout')
            expect(adapter.started).toBeFalsy()   
        })

        test('no data',async ()=>{
            adapter.waitForData = jest.fn().mockResolvedValue(false)
            adapter.getDefaultReconnectDelay = jest.fn().mockReturnValue(10)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:no data received')
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

    describe('stop',()=>{
        
    })

})  

