import { IncyclistCapability } from '../../types/capabilities'
import { sleep } from '../../utils/utils'
import { AntDeviceSettings } from '../types'
import AntScAdapter from './adapter'

describe( 'ANT SC adapter', ()=>{
    describe('constructor',()=>{
        test('typical settings, empty props',()=>{
            const settings = {       
                name: 'XXXX',
                selected: true,
                deviceID: '2606',
                profile: 'SC',
                interface: 'ant'
            } as AntDeviceSettings
            const adapter = new AntScAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('XXXX')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.Speed,IncyclistCapability.Cadence])

        })

        test('minimal settings',()=>{
            const settings:AntDeviceSettings = {       
                deviceID: '2606',
                profile: 'SC',
                interface: 'ant'
            }  as AntDeviceSettings
            const adapter = new AntScAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+SC 2606')
            expect(adapter.getCapabilities()).toEqual([ IncyclistCapability.Speed,IncyclistCapability.Cadence])

        })
        test('legacy settings',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Speed + Cadence Sensor',
                interface: 'ant',
                protocol: 'Ant'

            } as AntDeviceSettings
            const adapter = new AntScAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+SC 2606')            
        })

        test('incorrect profile',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ant'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntScAdapter(settings,{})
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
                adapter = new AntScAdapter(settings,{})
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
            adapter = new AntScAdapter({deviceID: '2606',profile: 'SC',interface: 'ant'})

        })

        test('no data (yet)',()=>{
            expect(adapter.getUniqueName()).toBe('Ant+SC 2606')
        })

        test('has received Cadence data',()=>{
            adapter.deviceData.CalculatedSpeed = 30
            expect(adapter.getUniqueName()).toBe('Ant+SC 2606')
        })

        test('has received ManId',()=>{
            adapter.deviceData.ManId = 123
            expect(adapter.getUniqueName()).toBe('Polar SC 2606')
        })

        test('has received ManId and HR data',()=>{
            adapter.deviceData.ManId = 123
            adapter.deviceData.CalculatedSpeed = 30
            expect(adapter.getUniqueName()).toBe('Polar SC 2606')
        })

        test('name is in settings',()=>{
            adapter.settings.name = 'Emma'
            adapter.deviceData.ManId = 123
            adapter.deviceData.CalculatedSpeed = 30
            expect(adapter.getUniqueName()).toBe('Emma')
        })

    })


    describe('mapToAdapterData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntScAdapter({deviceID: '2606',profile: 'SC',interface: 'ant'})
            adapter.startDataTimeoutCheck = jest.fn()
            adapter.data={}

        })

        test('receiving only device information',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606})
            expect(adapter.data).toEqual({})
        })

        test('receiving a speed, multiple times',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedSpeed:21/3.6})
            expect(adapter.data).toEqual({speed:21,timestamp:expect.anything()})

            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedSpeed:22/3.6,SerialNumber:10})
            expect(adapter.data).toEqual({speed:22,timestamp:expect.anything()})
        })

        test('receiving a distance, multiple times',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedSpeed:21/3.6, CalculatedDistance:1})
            expect(adapter.data).toEqual({speed:21,deviceDistanceCounter:1,timestamp:expect.anything()})

            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedSpeed:22/3.6,SerialNumber:10, CalculatedDistance:0})
            expect(adapter.data).toEqual({speed:22,deviceDistanceCounter:0,timestamp:expect.anything()})
        })

        test('receiving a cadence, multiple times',()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedCadence:60})
            expect(adapter.data).toEqual({cadence:60,timestamp:expect.anything()})

            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedCadence:90,SerialNumber:10})
            expect(adapter.data).toEqual({cadence:90,timestamp:expect.anything()})
        })



        test('receiving speed data, then a record without speed data',async ()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedSpeed:22/3.6})
            expect(adapter.data).toEqual({speed:22,timestamp:expect.anything()})
            const ts = adapter.data.timestamp

            await sleep(10)

            adapter.mapToAdapterData({ManId:89,DeviceID:2606})
            expect(adapter.data).toEqual({speed:22,timestamp:ts})
        })

        test('receiving cadence data, then a record without cadence data',async ()=>{
            adapter.mapToAdapterData({ManId:89,DeviceID:2606,CalculatedCadence:22})
            expect(adapter.data).toEqual({cadence:22,timestamp:expect.anything()})
            const ts = adapter.data.timestamp

            await sleep(10)

            adapter.mapToAdapterData({ManId:89,DeviceID:2606})
            expect(adapter.data).toEqual({cadence:22,timestamp:ts})
        })

    })


    describe('hasData',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new AntScAdapter({deviceID: '2606',profile: 'SC',interface: 'ant'})
            adapter.startDataTimeoutCheck = jest.fn() // mock to avoid open handle at end of test
        })

        test('receiving only device information',()=>{
            adapter.deviceData={ManId:89,DeviceID:2606}
            expect(adapter.hasData()).toBeFalsy()
        })

        test('receiving speed data',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,CalculatedSpeed:30}
            expect(adapter.hasData()).toBeTruthy()
        })

        test('receiving a speed=0',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,CalculatedSpeed:0}
            expect(adapter.hasData()).toBeTruthy()
        })

        test('receiving cadence data',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,CalculatedCadence:30}
            expect(adapter.hasData()).toBeTruthy()
        })

        test('receiving a cadence=0',()=>{
            adapter.deviceData = {ManId:89,DeviceID:2606,CalculatedCadence:0}
            expect(adapter.hasData()).toBeTruthy()
        })

    })

})  

