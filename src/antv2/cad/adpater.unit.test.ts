import { IncyclistCapability } from '../../types/capabilities'
import { sleep } from '../../utils/utils'
import { AntDeviceSettings } from '../types'
import AntHrAdapter from './adapter'

describe( 'ANT CAD adapter', ()=>{
    describe('constructor',()=>{
        test('typical settings, empty props',()=>{
            const settings = {       
                name: 'XXXX',
                selected: true,
                deviceID: '2606',
                profile: 'CAD',
                interface: 'ant'
            } as AntDeviceSettings
            const adapter = new AntHrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('XXXX')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.Cadence])

        })

        test('minimal settings',()=>{
            const settings:AntDeviceSettings = {       
                deviceID: '2606',
                profile: 'CAD',
                interface: 'ant'
            }  as AntDeviceSettings
            const adapter = new AntHrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+CAD 2606')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.Cadence])

        })
        test('legacy settings',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Cadence Sensor',
                interface: 'ant',
                protocol: 'Ant'

            } as AntDeviceSettings
            const adapter = new AntHrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+CAD 2606')            
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
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'CAD',interface: 'ant'})

        })

        test('no data (yet)',()=>{
            expect(adapter.getUniqueName()).toBe('Ant+CAD 2606')
        })

        test('has received Cadence data',()=>{
            adapter.deviceData.CalculatedCadence = 123
            expect(adapter.getUniqueName()).toBe('Ant+CAD 2606')
        })

        test('has received ManId',()=>{
            adapter.deviceData.ManId = 123
            expect(adapter.getUniqueName()).toBe('Polar CAD 2606')
        })

        test('has received ManId and HR data',()=>{
            adapter.deviceData.ManId = 123
            adapter.deviceData.CalculatedCadence = 180
            expect(adapter.getUniqueName()).toBe('Polar CAD 2606')
        })

        test('name is in settings',()=>{
            adapter.settings.name = 'Emma'
            adapter.deviceData.ManId = 123
            adapter.deviceData.ComputedHeartRate = 180
            expect(adapter.getUniqueName()).toBe('Emma')
        })

    })


    describe('mapToAdapterData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'CAD',interface: 'ant'})
            adapter.startDataTimeoutCheck = jest.fn()
            adapter.data={}

        })

        test('receiving only device information',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606})
            expect(adapter.data).toEqual({})
        })

        test('receiving a cadence, multiple times',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedCadence:60})
            expect(adapter.data).toEqual({cadence:60,timestamp:expect.anything()})

            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedCadence:90,SerialNumber:10})
            expect(adapter.data).toEqual({cadence:90,timestamp:expect.anything()})
        })

        test('receiving a heartrate, then a record without heartrate',async ()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedCadence:60})
            expect(adapter.data).toEqual({cadence:60,timestamp:expect.anything()})
            const ts = adapter.data.timestamp

            await sleep(10)

            adapter.mapToAdapterData({ManId:89,DeviceID:2606})
            expect(adapter.data).toEqual({cadence:60,timestamp:ts})
        })

    })


    describe('hasData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntHrAdapter({deviceID: '2606',profile: 'CAD',interface: 'ant'})
            adapter.startDataTimeoutCheck = jest.fn() // mock to avoid open handle at end of test
        })

        test('receiving only device information',()=>{
            adapter.deviceData={ManId:89,DeviceID:2606}
            expect(adapter.hasData()).toBeFalsy()
        })

        test('receiving a heartrate',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,CalculatedCadence:60}
            expect(adapter.hasData()).toBeTruthy()
        })

        test('receiving a heartrate=0',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,CalculatedCadence:0}
            expect(adapter.hasData()).toBeTruthy()
        })

    })

})  

