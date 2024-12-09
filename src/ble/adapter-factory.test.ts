import BleAdapterFactory from './adapter-factory'
import { BleSensor } from './base/sensor'
import { BleFmAdapter } from './fm'
import BleFitnessMachineDevice from './fm/sensor'

describe( 'BleAdapterFactory',()=>{
    describe('createInstance',()=>{

        let factory: BleAdapterFactory<BleSensor>
        let adapterMock 

        beforeEach( ()=>{
            adapterMock = jest.fn()

            class A extends BleFmAdapter{
                constructor(protocol) {
                    super(protocol)
                    adapterMock(protocol)
                }
    
            }
    
            factory = BleAdapterFactory.getInstance('ble')      
            factory.find = jest.fn( ()=> undefined)    
            factory.getAdapterInfo = jest.fn( ()=> ({protocol: 'fm', Adapter:A, Comm: BleFitnessMachineDevice }))  
        })

        test('Smart Trainer',()=>{
            const settings = {
                "name": "Test",
                "protocol": "BLE",
                "interface": "ble",
                
                "profile": "Smart Trainer"
            }
            const adapter = factory.createInstance(settings as any)
            expect(adapter).toBeDefined()
            expect(adapterMock).toHaveBeenCalledWith({name:'Test', protocol:'fm', interface:'ble'})
        })

        test('Tacx',()=>{
            const settings = {
                "name": "Test",
                "protocol": "BLE",
                "interface": "ble",
                
                "profile": "Tacx SmartTrainer"
            }
            const adapter = factory.createInstance(settings as any)
            expect(adapter).toBeDefined()
            expect(adapterMock).toHaveBeenCalledWith({name:'Test', protocol:'tacx', interface:'ble'})
            
        })

    })

})