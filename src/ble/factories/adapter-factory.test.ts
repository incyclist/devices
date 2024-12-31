import {BleAdapterFactory} from '../index'
import { TBleSensor } from '../base/sensor'
import { BleFmAdapter } from '../fm'

describe( 'BleAdapterFactory',()=>{
    describe('createInstance',()=>{

        let factory: BleAdapterFactory<TBleSensor>

        beforeEach( ()=>{
            factory = BleAdapterFactory.getInstance('ble')      
            factory.find = jest.fn( ()=> undefined)    
            //factory.getAdapterInfo = jest.fn( ()=> ({protocol: 'fm', Adapter:A, Comm: BleFitnessMachineDevice }))  
        })

        test('Legacy Smart Trainer',()=>{
            const settings = {
                "name": "Test",
                "protocol": "BLE",
                "interface": "ble",
                
                "profile": "Smart Trainer"
            }
            const adapter = factory.createInstance(settings as any)
            expect(adapter).toBeDefined()
            expect(adapter.getDisplayName()).toBe('Test')
            expect(adapter.getProtocolName()).toBe('fm')
        })

        test('fm',()=>{
            const settings = {
                "name": "Test",
                "protocol": "fm",
                "interface": "ble",
                "id":"12345",
                "address":"1111"
            }
            const adapter = factory.createInstance(settings as any)
            expect(adapter).toBeDefined()
            expect(adapter.getDisplayName()).toBe('Test')
            expect(adapter.getProtocolName()).toBe('fm')
        })


        test('Legacy Tacx',()=>{
            const settings = {
                "name": "Test",
                "protocol": "BLE",
                "interface": "ble",
                
                "profile": "Tacx SmartTrainer"
            }
            const adapter = factory.createInstance(settings as any)
            expect(adapter).toBeDefined()
            expect(adapter.getDisplayName()).toBe('Test')
            expect(adapter.getProtocolName()).toBe('tacx')
            
        })


    })

})