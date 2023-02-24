import { IncyclistCapability } from '../../types/capabilities'
import { sleep } from '../../utils/utils'
import { AntDeviceSettings } from '../types'
import AntFeAdapter from './adapter'

describe( 'fe adapter', ()=>{
    describe('constructor',()=>{
        test('typical settings, empty props',()=>{
            const settings = {       
                name: 'XXXX',
                selected: true,
                protocol: 'Ant',
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ant'
            } as AntDeviceSettings
            const adapter = new AntFeAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('XXXX')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, IncyclistCapability.Control])

        })

        test('minimal settings',()=>{
            const settings:AntDeviceSettings = {       
                deviceID: '2606',
                profile: 'FE',
                interface: 'ant'
            }  as AntDeviceSettings
            const adapter = new AntFeAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+FE 2606')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, IncyclistCapability.Control])

        })
        test('legacy settings',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ant',
                protocol: 'Ant'

            } as AntDeviceSettings
            const adapter = new AntFeAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+FE 2606')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, IncyclistCapability.Control])

        })

        test('incorrect profile',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Heartrate Monitor',
                interface: 'ant'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntFeAdapter(settings,{})
            }
            catch(err) {
                error = err;
            }
            expect(adapter).toBeUndefined()
            expect(error).toBeDefined()
        })
        test('incorrect interface',()=>{
            const settings = {       
                deviceID: '2606',
                profile:'FE',
                interface: 'ble'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntFeAdapter(settings,{})
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
                profile: 'Heartrate Monitor',
                interface: 'ant',
                protocol: 'Ant'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntFeAdapter(settings,{})
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
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})

        })

        test('no data (yet)',()=>{
            expect(adapter.getDisplayName()).toBe('Ant+FE 2606')
        })

        test('has received HR data',()=>{
            adapter.deviceData.InstantaneousPower = 123
            expect(adapter.getDisplayName()).toBe('Ant+FE 2606 (123)')
        })

        test('has received ManId',()=>{
            adapter.deviceData.ManId = 89
            expect(adapter.getDisplayName()).toBe('Tacx FE 2606')
        })

        test('has received ManId and HR data',()=>{
            adapter.deviceData.ManId = 32
            adapter.deviceData.InstantaneousPower = 180
            expect(adapter.getDisplayName()).toBe('Wahoo FE 2606 (180)')
        })

    })

    describe('onDeviceData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})
            adapter.emitData = jest.fn()
            adapter.startDataTimeoutCheck = jest.fn()
            adapter.emit = jest.fn()
            adapter.hasDataListeners = jest.fn()
        })

        test('initial data - not started',()=>{
            adapter.deviceData = {DeviceID:'2606'}
            adapter.started = false;
            adapter.paused = false
            adapter.ivDataTimeout = undefined
            adapter.lastDataTS = undefined;
            adapter.lastUpdate = undefined
            adapter.dataMsgCount = 0

            adapter.onDeviceData({DeviceID:'2606', InstantaneousPower:100})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606'})
            expect(adapter.emitData).not.toHaveBeenCalled()
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
            adapter.hasDataListeners.mockReturnValue(true)
            

            adapter.onDeviceData({DeviceID:'2606', InstantaneousPower:100})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', InstantaneousPower:100})
            expect(adapter.emitData).toHaveBeenCalledWith( expect.objectContaining( {power:100, cadence:0, distance:0, heartrate:0, slope:0, speed:0, timestamp:expect.any(Number)}))
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

            adapter.onDeviceData({DeviceID:'2606', InstantaneousPower:60, ManId:89})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', InstantaneousPower:60, ManId:89})
            expect(adapter.emit).toHaveBeenCalledWith('device-info',{manufacturer:'Tacx'})
        })

        test('data update #default cycle mode',()=>{
            adapter.deviceData = {DeviceID:'2606', InstantaneousPower:160, Cadence:90, VirtualSpeed:30}
            adapter.started = true;
            adapter.paused = false
            adapter.ivDataTimeout = 123
            adapter.lastDataTS = Date.now()-1000;
            adapter.dataMsgCount = 1
            adapter.hasDataListeners.mockReturnValue(true)
            adapter.canSendUpdate = jest.fn().mockReturnValue(true)
            adapter.getCyclingMode().getTimeSinceLastUpdate = jest.fn().mockReturnValue(1)

            adapter.onDeviceData({DeviceID:'2606', InstantaneousPower:200, Cadence:90, VirtualSpeed:35})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', InstantaneousPower:200, Cadence:90, VirtualSpeed:35})
            expect(adapter.emitData).toHaveBeenCalledWith(expect.objectContaining( {power:200, cadence:90,  speed:expect.closeTo(7.8,1), timestamp:expect.any(Number)}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(2)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()
        })

        test('data update #mocked cycle mode',()=>{
            adapter.deviceData = {DeviceID:'2606', InstantaneousPower:160, Cadence:90, VirtualSpeed:30}
            adapter.started = true;
            adapter.paused = false
            adapter.ivDataTimeout = 123
            adapter.lastDataTS = Date.now()-1000;
            adapter.dataMsgCount = 1
            adapter.hasDataListeners.mockReturnValue(true)
            adapter.canSendUpdate = jest.fn().mockReturnValue(true)
            adapter.getCyclingMode().updateData= jest.fn().mockReturnValue( { })            
            adapter.transformData = jest.fn().mockReturnValue( {power:201, cadence:91, speed:10, timestamp:1234})

            adapter.onDeviceData({DeviceID:'2606', InstantaneousPower:200, Cadence:90, VirtualSpeed:35})
            expect(adapter.deviceData).toMatchObject({DeviceID:'2606', InstantaneousPower:200, Cadence:90, VirtualSpeed:35})
            expect(adapter.emitData).toHaveBeenCalledWith(expect.objectContaining( {power:201, cadence:91,  speed:10, timestamp:1234}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(2)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()            
        })


        test('data update, last emit was more frequent than limit',()=>{
            adapter.deviceData = {DeviceID:'2606', InstantaneousPower:160, Cadence:90, VirtualSpeed:30}
            adapter.data = {power:100, cadence:60, speed:30}
            adapter.started = true;
            adapter.paused = false
            adapter.canSendUpdate = jest.fn().mockReturnValue(false)
            adapter.getCyclingMode().updateData= jest.fn().mockReturnValue( { })            
            adapter.transformData = jest.fn().mockReturnValue( {power:201, cadence:91, speed:10, timestamp:1234})

            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:61, ManId:89})

            adapter.onDeviceData({DeviceID:'2606', InstantaneousPower:200, Cadence:90, VirtualSpeed:35})
            expect(adapter.emitData).not.toHaveBeenCalled()
            expect(adapter.data).toEqual({power:100, cadence:60, speed:30}) // data has not been updated

            
        })
    })

    describe('mapToCycleModeData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})
            adapter.startDataTimeoutCheck = jest.fn()
            adapter.data={}

        })

        test('receiving only device information',()=>{
            const res = adapter.mapToCycleModeData({ManId:89,DeviceID:2606})
            expect(res).toEqual({
                isPedalling: false,
                power: 0,
                pedalRpm: undefined,
                speed: 0,
                heartrate:0,
                distanceInternal:0,        // Total Distance in meters             
                slope:undefined,
                time:undefined
            })
        })

        test('receiving VirtualSpeed',()=>{
            const res = adapter.mapToCycleModeData({ManId:89,DeviceID:2606,VirtualSpeed:10,RealSpeed:20}) // 10 m/s
            expect(res.speed).toEqual(36)
        })
        test('receiving RealSpeed',()=>{
            const res = adapter.mapToCycleModeData({ManId:89,DeviceID:2606,RealSpeed:10}) // 10 m/s
            expect(res.speed).toEqual(36)
        })

        test('receiving Incline',()=>{
            const res = adapter.mapToCycleModeData({ManId:89,DeviceID:2606,Incline:10}) 
            expect(res.slope).toEqual(10)
        })

        test('receiving InstantaneousPower',()=>{
            const res = adapter.mapToCycleModeData({ManId:89,DeviceID:2606,InstantaneousPower:100}) 
            expect(res.power).toEqual(100)
        })

        test('receiving ElapsedTime',()=>{
            const res = adapter.mapToCycleModeData({ManId:89,DeviceID:2606,ElapsedTime:100}) 
            expect(res.time).toEqual(100)
        })
        test('receiving Cadence',()=>{
            const res = adapter.mapToCycleModeData({ManId:89,DeviceID:2606,Cadence:90}) 
            expect(res.pedalRpm).toEqual(90)
            expect(res.isPedalling).toEqual(true)
        })


    })



    describe('start',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})

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

            adapter.sensor.sendUserConfiguration = jest.fn()
            adapter.sensor.sendTrackResistance = jest.fn()
            
        })


        test('normal start',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.waitForData.mockResolvedValue(true)
            adapter.sensor.sendUserConfiguration.mockResolvedValue(true)
            adapter.sensor.sendTrackResistance.mockResolvedValue(true)
            
            
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
            adapter.sensor.sendUserConfiguration.mockResolvedValue(true)
            adapter.sensor.sendTrackResistance.mockResolvedValue(true)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(error).toBeUndefined()              
            expect(adapter.started).toBeTruthy()   
        })

        test('sendUserConfiguration fails',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.stop.mockResolvedValue(true)
            adapter.startupRetryPause=10;
            adapter.waitForData.mockResolvedValue(true)
            adapter.sensor.sendUserConfiguration.mockResolvedValue(false)
            adapter.sensor.sendTrackResistance.mockResolvedValue(true)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeTruthy()   
            expect(error.message).toBe('could not start device, reason: could not send FE commands')              
        })

        test('sendUserConfiguration fails once',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.stop.mockResolvedValue(true)
            adapter.startupRetryPause=10;
            adapter.waitForData.mockResolvedValue(true)
            adapter.sensor.sendUserConfiguration.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
            adapter.sensor.sendTrackResistance.mockResolvedValue(true)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeTruthy()   
            expect(error).toBeUndefined()
        })

        test('sendTrackResistance fails',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.stop.mockResolvedValue(true)
            adapter.startupRetryPause=10;
            adapter.waitForData.mockResolvedValue(true)
            adapter.sensor.sendUserConfiguration.mockResolvedValue(true)
            adapter.sensor.sendTrackResistance.mockResolvedValue(false)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeTruthy()   
            expect(error.message).toBe('could not start device, reason: could not send FE commands')              
        })

        test('sendTrackResistance fails once',async ()=>{
            adapter.connect.mockResolvedValue(true)
            adapter.ant.startSensor.mockResolvedValue(true)
            adapter.stop.mockResolvedValue(true)
            adapter.startupRetryPause=10;
            adapter.waitForData.mockResolvedValue(true)
            adapter.sensor.sendUserConfiguration.mockResolvedValue(true)
            adapter.sensor.sendTrackResistance.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeTruthy()   
            expect(error).toBeUndefined()
        })

    })

    describe('sendUpdate',()=>{

        let adapter
        beforeEach( ()=>{           
            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})           
            adapter.startDataTimeoutCheck = jest.fn()  // avoid open handles
            adapter.reconnect = jest.fn()
            adapter.emit = jest.fn()
            adapter.started = true;
            adapter.isReconnecting = false;
            adapter.paused = false;
            adapter.getCyclingMode().sendBikeUpdate = jest.fn()
            adapter.getCyclingMode().getBikeInitRequest = jest.fn()
            adapter.sensor.sendTrackResistance = jest.fn()            
            adapter.sensor.sendTargetPower = jest.fn()


        })

        test('slope',async ()=>{
            adapter.getCyclingMode().sendBikeUpdate.mockReturnValue({slope:1})
            
            await adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request

            expect(adapter.sensor.sendTrackResistance).toHaveBeenCalledWith(1)
            expect(adapter.sensor.sendTargetPower).not.toHaveBeenCalled()
        })

        test('targetPower',async ()=>{
            adapter.getCyclingMode().sendBikeUpdate.mockReturnValue({targetPower:110})

            await adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request

            expect(adapter.sensor.sendTrackResistance).not.toHaveBeenCalled()
            expect(adapter.sensor.sendTargetPower).toHaveBeenCalledWith(110)
            
        })


        test('slope and targetPower',async ()=>{
            
            //adapter.sensor.sendTargetPower = console.log 
            adapter.getCyclingMode().sendBikeUpdate.mockReturnValue({slope:2, targetPower:200})

            await adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request

            expect(adapter.sensor.sendTrackResistance).toHaveBeenCalledWith(2)
            expect(adapter.sensor.sendTargetPower).toHaveBeenCalledWith(200)
        })


        test('reset',async ()=>{
            adapter.getCyclingMode().sendBikeUpdate.mockReturnValue({targetPower:110})
            adapter.getCyclingMode().getBikeInitRequest.mockReturnValue({slope:1})

            await adapter.sendUpdate({reset:true}) 

            expect(adapter.sensor.sendTrackResistance).toHaveBeenCalledWith(1)
            expect(adapter.sensor.sendTargetPower).not.toHaveBeenCalled()
            
        })

        test('adpater is paused',async ()=>{

            adapter.paused = true;

            await adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request

            expect(adapter.getCyclingMode().sendBikeUpdate).not.toHaveBeenCalled()
            expect(adapter.sensor.sendTrackResistance).not.toHaveBeenCalled()
            expect(adapter.sensor.sendTargetPower).not.toHaveBeenCalled()
            
        })

        test('adapter is reconnecting',async ()=>{
            adapter.isReconnecting = true

            await adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request

            expect(adapter.getCyclingMode().sendBikeUpdate).not.toHaveBeenCalled()
            expect(adapter.sensor.sendTrackResistance).not.toHaveBeenCalled()
            expect(adapter.sensor.sendTargetPower).not.toHaveBeenCalled()            
        })

        test('bike update times out, autmatic reconnect disabled',async ()=>{
            adapter.sensor.sendTrackResistance.mockRejectedValue(new Error('timeout'))
            adapter.getCyclingMode().sendBikeUpdate.mockReturnValue({slope:1})

            await adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request


            expect(adapter.reconnect).not.toHaveBeenCalled()            
            expect(adapter.emit).toHaveBeenCalledWith('timeout')
        })

        test('bike update times out, automatic reconnect enabled',async ()=>{
            const reconnect = jest.fn()
            adapter.reconnect=jest.fn()
            adapter.startProps.automaticReconnect = true
            adapter.sensor.sendTargetPower.mockRejectedValue(new Error('timeout'))
            adapter.getCyclingMode().sendBikeUpdate.mockReturnValue({targetPower:1})

            await adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request

            expect(adapter.reconnect).toHaveBeenCalled()        
            expect(adapter.emit).toHaveBeenCalledWith('timeout')    
        })

    })

    describe('stop',()=>{
        
    })

})  

