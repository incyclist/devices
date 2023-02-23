import { IncyclistCapability } from '../../types/capabilities'
import { AntDeviceSettings } from '../types'
import AntHrAdapter from './adapter'

describe( 'adapter', ()=>{
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
            expect(adapter.getDisplayName()).toBe('Polar Hrm 2606')
        })

        test('has received ManId and HR data',()=>{
            adapter.deviceData.ManId = 123
            adapter.deviceData.ComputedHeartRate = 180
            expect(adapter.getDisplayName()).toBe('Polar Hrm 2606 (180)')
        })

    })

    describe('onDeviceData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})
            adapter.onDataFn = jest.fn()
            adapter.startDataTimeoutCheck = jest.fn()
            adapter.emit = jest.fn()
        })

        test('initial data - not started',()=>{
            adapter.deviceData = {DeviceID:'2606'}
            adapter.started = false;
            adapter.paused = false
            adapter.ivDataTimeout = undefined
            adapter.lastDataTS = undefined;
            adapter.lastUpdate = undefined
            adapter.dataMsgCount = 0

            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:60})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606'})
            expect(adapter.onDataFn).not.toHaveBeenCalledWith()
            expect(adapter.lastUpdate).toBeUndefined()
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()
        })


        test('initial data',()=>{
            adapter.deviceData = {DeviceID:'2606'}
            adapter.started = true;
            adapter.paused = false
            adapter.ivDataTimeout = undefined
            adapter.lastDataTS = undefined;
            adapter.lastUpdate = undefined
            adapter.dataMsgCount = 0

            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:60})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', ComputedHeartRate:60})
            expect(adapter.onDataFn).toHaveBeenCalledWith({heartrate:60})
            expect(adapter.lastUpdate).toBeDefined()
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
            expect(adapter.startDataTimeoutCheck).toHaveBeenCalled()
        })

        test('initial data - includes ManId',()=>{
            adapter.deviceData = {DeviceID:'2606'}
            adapter.started = true;
            adapter.paused = false
            adapter.ivDataTimeout = undefined
            adapter.lastDataTS = undefined;
            adapter.lastUpdate = undefined
            adapter.dataMsgCount = 0

            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:60, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', ComputedHeartRate:60})
            expect(adapter.onDataFn).toHaveBeenCalledWith({heartrate:60})
            expect(adapter.lastUpdate).toBeDefined()
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
            expect(adapter.startDataTimeoutCheck).toHaveBeenCalled()
            expect(adapter.emit).toHaveBeenCalledWith('device-info',{manufacturer:'Tacx'})
        })

        test('data update',()=>{
            adapter.deviceData = {DeviceID:'2606', ComputedHeartRate:60}
            adapter.started = true;
            adapter.paused = false
            adapter.ivDataTimeout = 123
            adapter.lastDataTS = Date.now()-1000;
            adapter.lastUpdate = Date.now()-3000;
            adapter.dataMsgCount = 1

            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:61, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', ComputedHeartRate:61,ManId:89})
            expect(adapter.onDataFn).toHaveBeenCalledWith({heartrate:61})
            expect(adapter.lastUpdate).toBeDefined()
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(2)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()
            
        })

        test('data update - last emit was more frequent than limit',()=>{
            adapter.deviceData = {DeviceID:'2606', ComputedHeartRate:60}
            adapter.started = true;
            adapter.paused = false
            adapter.ivDataTimeout = 123
            adapter.lastDataTS = Date.now()-1000;
            adapter.lastUpdate = Date.now()-10;
            adapter.dataMsgCount = 1

            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:61, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', ComputedHeartRate:61,ManId:89})
            expect(adapter.onDataFn).not.toHaveBeenCalled()
            expect(adapter.lastUpdate).toBeDefined()
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(2)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()
            
        })
    })

    describe('udpateData',()=>{

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

    describe('stop',()=>{
        
    })

})  

