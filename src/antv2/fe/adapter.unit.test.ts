import { FitnessEquipmentSensor, FitnessEquipmentSensorState } from 'incyclist-ant-plus'
import { IncyclistCapability } from '../../types/capabilities'
import { sleep } from '../../utils/utils'
import { AntDeviceSettings } from '../types'
import AntFeAdapter from './adapter'
import SmartTrainerCyclingMode from '../../modes/antble-smarttrainer'
import ERGCyclingMode from '../../modes/antble-erg'

const D = (data):FitnessEquipmentSensorState => {
    return {
        PairedDevices:[],
        RawData: Buffer.from([]),
        ...data
    }
}

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
            expect(adapter.getProfileName()).toBe('FE')                        
            expect(adapter.getLegacyProfileName()).toBe('Smart Trainer')                        
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

    describe('getUniqueName',()=>{
        let adapter:AntFeAdapter
        beforeEach( ()=>{            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})
        })

        test('no data (yet)',()=>{
            expect(adapter.getUniqueName()).toBe('Ant+FE 2606')
        })

        test('has received HR data',()=>{
            adapter.deviceData.InstantaneousPower = 123
            expect(adapter.getUniqueName()).toBe('Ant+FE 2606')
        })

        test('has received ManId',()=>{
            adapter.deviceData.ManId = 89
            expect(adapter.getUniqueName()).toBe('Tacx FE 2606')
        })

        test('has received ManId and HR data',()=>{
            adapter.deviceData.ManId = 32
            adapter.deviceData.InstantaneousPower = 180
            expect(adapter.getUniqueName()).toBe('Wahoo FE 2606')
        })

        test('name is in settings',()=>{
            adapter.settings.name = 'Emma'
            adapter.deviceData.ManId = 123
            adapter.deviceData.InstantaneousPower = 150
            expect(adapter.getUniqueName()).toBe('Emma')
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
        let adapter
        
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
            expect(adapter.emitData).toHaveBeenCalledWith(expect.objectContaining({power:100}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
            expect(adapter.startDataTimeoutCheck).not.toHaveBeenCalled()
        })


        test('initial data - no ManId',()=>{
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
            expect(adapter.emitData).toHaveBeenCalledWith( expect.objectContaining( {power:100, cadence:0, speed:0, timestamp:expect.any(Number)}))
            expect(adapter.lastDataTS).toBeDefined()
            expect(adapter.dataMsgCount).toBe(1)
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
            expect(adapter.emit).toHaveBeenCalledWith('device-info',expect.anything(),expect.objectContaining({manufacturer:'Tacx'}))
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
            adapter.transformData = jest.fn(()=>{ adapter.data= {power:201, cadence:91, speed:10, timestamp:1234}})

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
            adapter.isUpdateWithinFrequency = jest.fn().mockReturnValue(false)


            adapter.onDeviceData({DeviceID:'2606', ComputedHeartRate:61, ManId:89})

            adapter.onDeviceData({DeviceID:'2606', InstantaneousPower:200, Cadence:90, VirtualSpeed:35})
            expect(adapter.emitData).not.toHaveBeenCalled()
            expect(adapter.data).toEqual({power:100, cadence:60, speed:30}) // data has not been updated

            
        })

        test('detected HR data, capability not yet supported',()=>{
            adapter.deviceData = D({DeviceID:2606, InstantaneousPower:160, Cadence:90, VirtualSpeed:30})
            adapter.onDeviceData({DeviceID:'2606', HeartRate:61, ManId:89})

            expect(adapter.emit).toHaveBeenCalledWith(
                'device-info',
                expect.anything(),
                {capabilities: expect.arrayContaining([IncyclistCapability.HeartRate])}
            )
        })

        test('detected HR data, capability already supported',()=>{
            adapter.deviceData = D({DeviceID:2606, InstantaneousPower:160, Cadence:90, VirtualSpeed:30})
            adapter.addCapability(IncyclistCapability.HeartRate)
            adapter.onDeviceData({DeviceID:'2606', HeartRate:61, ManId:89})

            expect(adapter.emit).not.toHaveBeenCalledWith(
                'device-info',
                expect.anything(),
                {capabilities: expect.anything}
            )
        })

    })

    describe('mapData',()=>{

        const D = (data):FitnessEquipmentSensorState => {
            return {
                PairedDevices:[],
                RawData: Buffer.from([]),
                ...data
            }
        }

        let adapter:AntFeAdapter
        beforeEach( ()=>{            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})
            //adapter.startDataTimeoutCheck = jest.fn()
            adapter.data={}

        })

        test('receiving only device information',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606}))
            expect(res).toEqual({
                isPedalling: false,
                power: 0,
                pedalRpm: 0,
                speed: 0
            })
        })

        test('receiving VirtualSpeed',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,VirtualSpeed:10,RealSpeed:20})) // 10 m/s
            expect(res.speed).toEqual(36)
        })
        test('receiving RealSpeed',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,RealSpeed:10})) // 10 m/s
            expect(res.speed).toEqual(36)
        })

        test('receiving Power without Cadence',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,InstantaneousPower:50,RealSpeed:10})) // 10 m/s
            expect(res.speed).toEqual(36)
            expect(res.pedalRpm).toBe(0)
            expect(res.isPedalling).toBe(true)
        })

        test('receiving Power with Cadence',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,InstantaneousPower:50,RealSpeed:10,Cadence:10})) // 10 m/s
            expect(res.speed).toEqual(36)
            expect(res.pedalRpm).toBe(10)
            expect(res.isPedalling).toBe(true)
        })

        test('receiving Incline',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,Incline:10})) 
            expect(res.slope).toEqual(10)
        })

        test('receiving InstantaneousPower',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,InstantaneousPower:100})) 
            expect(res.power).toEqual(100)
        })

        test('receiving ElapsedTime',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,ElapsedTime:100})) 
            expect(res.time).toEqual(100)
        })
        test('receiving Cadence',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,Cadence:90})) 
            expect(res.pedalRpm).toEqual(90)
            expect(res.isPedalling).toEqual(true)
        })
        test('receiving Heartrate',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,Cadence:90,HeartRate:70})) 
            expect(res.heartrate).toEqual(70)
        })
        test('receiving Distance',()=>{
            const res = adapter.mapData(D({ManId:89,DeviceID:2606,Distance:12})) 
            expect(res.distanceInternal).toEqual(12)
        })


    })

    describe('transformData',()=>{

        let a:AntFeAdapter
        beforeEach( ()=>{            
            a = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})
            //a.startDataTimeoutCheck = jest.fn()
            a.data={}

        })

        test('normal data',()=>{
            a.transformData({power:100, pedalRpm:90,speed:30, isPedalling:true, time:10},D({}))
            expect(a.getData()).toEqual({power:100, cadence:90, speed:30, deviceTime:10, timestamp:expect.anything(),})
        })

        test('with distance info',()=>{
            a.transformData({power:100, pedalRpm:90,speed:30, isPedalling:true, time:10, distanceInternal:20},D({Distance:20}))
            expect(a.getData()).toEqual({power:100, cadence:90, speed:30, deviceTime:10, timestamp:expect.anything(),deviceDistanceCounter:20, internalDistanceCounter:20})

            a.transformData({power:100, pedalRpm:90,speed:30, isPedalling:true, time:10, distanceInternal:22},D({Distance:22}))
            expect(a.getData()).toEqual({power:100, cadence:90, speed:30, deviceTime:10, timestamp:expect.anything(),distance:2, deviceDistanceCounter:22, internalDistanceCounter:22})
        })

        test('with heartrate',()=>{
            a.transformData({power:100, pedalRpm:90,speed:30, isPedalling:true, time:10, heartrate:90},D({HeartRate:90}))
            expect(a.getData()).toEqual({power:100, cadence:90, speed:30, deviceTime:10, timestamp:expect.anything(),heartrate:90})
        })

        test('with slope',()=>{
            a.transformData({power:100, pedalRpm:90,speed:30, isPedalling:true, time:10, slope:1.9},D({}))
            expect(a.getData()).toEqual({power:100, cadence:90, speed:30, deviceTime:10, timestamp:expect.anything(),slope:1.9})
        })

    })

    describe('start',()=>{
        let adapter:AntFeAdapter
        let sensor
        beforeEach( ()=>{            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})

            adapter.getDefaultStartupTimeout = jest.fn().mockReturnValue(100)
            adapter.getDefaultReconnectDelay = jest.fn().mockReturnValue(5)

            adapter.onDataFn = jest.fn();
            (adapter as any).dataMsgCount = 1;
            adapter.stop = jest.fn();
            adapter.resetData = jest.fn();

            sensor = (adapter.sensor as FitnessEquipmentSensor);
            jest.spyOn(adapter,'resume')
            jest.spyOn(adapter,'emit')

            adapter.connect = jest.fn().mockResolvedValue(true)
            adapter.startSensor= jest.fn().mockResolvedValue(true)
            adapter.waitForData = jest.fn().mockResolvedValue(true)
            sensor.sendUserConfiguration = jest.fn().mockResolvedValue(true)
            sensor.sendTrackResistance = jest.fn().mockResolvedValue(true)
            sensor.sendTargetPower= jest.fn().mockResolvedValue(true)
            
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
            expect(adapter.startSensor).not.toHaveBeenCalled()
        })

        test('connect fails',async ()=>{
            adapter.connect=jest.fn().mockResolvedValue(false)

            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:could not connect')
            expect(adapter.started).toBeFalsy()   
        })

        test('no data',async ()=>{
            adapter.waitForData=jest.fn().mockReturnValue( false)
            
            let error;
            try {
                await adapter.start({startupTimeout:50})         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:no data received')
            expect(adapter.started).toBeFalsy()   
        })

        test('start timeout',async ()=>{
            sensor.sendUserConfiguration = jest.fn( async ()=>{ await sleep(500); return true})
            sensor.sendTrackResistance = jest.fn( async ()=>{ await sleep(500); return true})
            sensor.sendTargetPower = jest.fn( async ()=>{ await sleep(500); return true})
            
            let error;
            try {
                await adapter.start({startupTimeout:20})         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:timeout')
            expect(adapter.started).toBeFalsy()   
        },2000)


        test('start sensor fails permanently',async ()=>{
            adapter.startSensor = jest.fn().mockResolvedValue(false)
                
            
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(error.message).toBe('could not start device, reason:could not connect')
            expect(adapter.started).toBe(false)   
        })

        test('start sensor fails once',async ()=>{
            adapter.startSensor = jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)
            
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(error).toBeUndefined()              
            expect(adapter.started).toBe(true)   
        })
        test('start sensor throws error',async ()=>{
            adapter.startSensor = jest.fn().mockRejectedValue( new Error('XX'))
            
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(error.message).toBe('could not start device, reason:could not connect')
            expect(adapter.started).toBe(false)   
        })

        test('sendUserConfiguration fails',async ()=>{
            sensor.sendUserConfiguration.mockResolvedValue(false)
            
            let error;
            try {
                await adapter.start({startupTimeout:10})         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeFalsy()   
            expect(error.message).toBe('could not start device, reason:could not send FE commands')              
        })

        test('sendUserConfiguration fails once',async ()=>{
            sensor.sendUserConfiguration
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)
            
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeTruthy()   
            expect(error).toBeUndefined()
        })

        test('sendUserConfiguration rejects with error',async ()=>{
            sensor.sendUserConfiguration.mockRejectedValue( new Error('X'))
            
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeFalsy()   
            expect(error.message).toBe('could not start device, reason:could not send FE commands')              
        })




        test('sendTrackResistance fails',async ()=>{
            sensor.sendTrackResistance.mockResolvedValue(false)
            
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeFalsy()   
            expect(error.message).toBe('could not start device, reason:could not send FE commands')              
        })

        test('sendTrackResistance fails once',async ()=>{
            sensor.sendTrackResistance
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)
            
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(adapter.started).toBeTruthy()   
            expect(error).toBeUndefined()
        })

        test('paused',async ()=>{
            
            adapter.paused = true;
            const res = await adapter.start()         
            expect(res).toBe(true)
            expect(adapter.started).toBeTruthy()   
            expect(adapter.resume).toHaveBeenCalled()
            expect(adapter.paused).toBe(false)
        })

        test('stopped',async ()=>{
            adapter.stopped = true;
            
            const res = await adapter.start({startupTimeout:100})         
           
            expect(res).toBeTruthy()   
            expect(adapter.started).toBeTruthy()   
            expect(adapter.stopped).toBe(false)   
        })


        test('already started, not paused, not stopped',async ()=>{
            adapter.started = true;
            adapter.paused = false;
            adapter.stopped = false;

            const res = await adapter.start({startupTimeout:100})     
            expect(res).toBe(true)
            expect(adapter.connect).not.toHaveBeenCalled()
            expect(adapter.resume).not.toHaveBeenCalled()
                
        })

        test('reconnect, does not repeat FE messages',async ()=>{
            (adapter as any).isReconnecting = true;

            const res = await adapter.start({reconnect:true})     
            expect(res).toBe(true)
            expect(sensor.sendUserConfiguration).not.toHaveBeenCalled()
            expect(sensor.sendTrackResistance).not.toHaveBeenCalled()
            expect(sensor.sendTargetPower).not.toHaveBeenCalled()
                
        })

    })

    describe('stop',()=>{
        
    })

    describe('sendUpdate',()=>{

        let adapter
        beforeEach( ()=>{           
            
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})           
            adapter.startDataTimeoutCheck = jest.fn()  // avoid open handles
            adapter.reconnect = jest.fn()
            adapter.emit = jest.fn()
            adapter.started = true;
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
            adapter.isReconnecting = jest.fn().mockReturnValue(true)

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

            expect(adapter.emit).toHaveBeenCalledWith('timeout')    
        })

        test('previous bike update is still buy',async ()=>{
            adapter.sensor.sendTargetPower = jest.fn( ()=>setTimeout(()=>true,100) )
            adapter.getCyclingMode().sendBikeUpdate.mockReturnValue({targetPower:1})
            adapter.logEvent = jest.fn()

            adapter.sendUpdate({slope:0, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request
            adapter.sendUpdate({slope:1, minPower:100, maxPower:200}) // any data that does not contain reset, cycling mode will determine the final request
            await adapter.promiseSendUpdate             

            expect(adapter.logEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({message:'send bike update requested'}))
            expect(adapter.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({message:'send bike update skipped', reason:'busy'}))
            expect(adapter.sensor.sendTargetPower).toHaveBeenCalledTimes(1)   
            expect(adapter.logEvent).toHaveBeenCalledTimes(2)
        })

    })

    test('stop - will reset sensor connection state',async ()=>{
        const adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})
        await adapter.stop()
        expect( (adapter as any).sensorConnected).toBe(false)
        
    })

    describe('reconnect',()=>{
        let adapter:AntFeAdapter
        beforeEach( ()=>{
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})    
            adapter.stop = jest.fn().mockResolvedValue(true)
            adapter.start = jest.fn().mockResolvedValue(true)
        })

        test('success',async ()=>{
            const res = await adapter.reconnect()
            expect(res).toBe(true)
            expect(adapter.started).toBe(true)
            expect(adapter.isReconnecting()).toBe(false)
        })

        test('stop fails, will start anyway',async ()=>{
            adapter.start = jest.fn().mockResolvedValue(false)
            const res = await adapter.reconnect()
            expect(res).toBe(true)
            expect(adapter.started).toBe(true)
            expect(adapter.isReconnecting()).toBe(false)
        })

        test('start fails',async ()=>{
            adapter.start = jest.fn().mockRejectedValue( new Error('X'))

            const res = await adapter.reconnect()
            expect(res).toBe(false)
            expect(adapter.started).toBe(false)
            expect(adapter.isReconnecting()).toBe(false)
        })

        test('already reconnecting',async ()=>{
            adapter.stop = jest.fn( async ()=> { await sleep(50); return true})
            const call1 = adapter.reconnect();
            await sleep(5)
            const call2 = adapter.reconnect();

            const res = await Promise.allSettled([call1,call2])

            expect(res[0]).toMatchObject( {status:'fulfilled', value:true})
            expect(res[1]).toMatchObject( {status:'fulfilled', value:true})                       
            expect(adapter.isReconnecting()).toBe(false)
            expect(adapter.stop).toHaveBeenCalledTimes(1)
            expect(adapter.start).toHaveBeenCalledTimes(1)
        })


    })

    describe('sendInitCommands',()=>{
        let adapter:AntFeAdapter
        let ERGMode,STMode
        beforeEach( ()=>{
            adapter = new AntFeAdapter({deviceID: '2606',profile: 'FE',interface: 'ant'})                       
            adapter.sendUpdate = jest.fn().mockResolvedValue(undefined)
            adapter.started = true;
            adapter.paused = false;
            adapter.stopped = false

            ERGMode = new ERGCyclingMode(adapter)
            STMode = new SmartTrainerCyclingMode(adapter)

            
        })

        test('switched to ERG Cycling Mode - power was set',async ()=>{
            adapter.data.power=123
            adapter.getCyclingMode=jest.fn().mockReturnValue(ERGMode) 
            const res = await adapter.sendInitCommands()
            expect(res).toBe(true)
            expect(adapter.sendUpdate).toHaveBeenCalledWith({targetPower:123},true)

        })
        test('switched to ERG Cycling Mode - no power set',async ()=>{
            adapter.data.power=0
            ERGMode.getBikeInitRequest = jest.fn().mockReturnValue({targetPower:100})
            adapter.getCyclingMode=jest.fn().mockReturnValue(ERGMode) 
            const res = await adapter.sendInitCommands()
            expect(res).toBe(true)
            expect(adapter.sendUpdate).toHaveBeenCalledWith({targetPower:100},true)

        })

        test('switched to SmartTrainer Cycling Mode',async ()=>{
            adapter.getCyclingMode=jest.fn().mockReturnValue(STMode) 
            const res = await adapter.sendInitCommands()
            expect(res).toBe(false)

        })

        test('not started',async ()=>{
            adapter.started = false
            const res = await adapter.sendInitCommands()
            expect(res).toBe(false)
        })

        test('stopped',async ()=>{
            adapter.stopped = true
            const res = await adapter.sendInitCommands()
            expect(res).toBe(false)

        })

        test('sendUpdate throes error',async ()=>{
            adapter.getCyclingMode=jest.fn().mockReturnValue(ERGMode) 
            adapter.sendUpdate = jest.fn().mockRejectedValue( new Error('X'))
            const res = await adapter.sendInitCommands()
            expect(res).toBe(false)

        })


    })

})  

