
import { MockLogger} from '../../../test/logger'
import { sleep } from "../../utils/utils"
import { MockBinding } from "../bindings"
import { HrMock } from "./mock"
import BleAdapterFactory from '../adapter-factory'
import InterfaceFactory from '../../factories/interfaces'

describe( 'BleHrAdapter #Integration',()=>{
    let ble;

    beforeAll( async ()=>{
        ble = InterfaceFactory.create('ble',{logger:MockLogger,binding:MockBinding})
    })

    describe('start',()=>{
        beforeEach( async ()=>{
            MockBinding.reset()
            MockBinding.addMock(HrMock)
            HrMock.setNotifyFrequency( 10);
            await ble.connect()
        })

        afterEach( async ()=>{
            await ble.disconnect();
            jest.useRealTimers()
        })

        test('HR Sensor is available',async ()=>{

            const onData = jest.fn();
            const adapter = BleAdapterFactory.getInstance().createInstance( {interface:'ble', protocol:'hr',name:'HRM-Mock',address:'44:0d:ec:12:40:61'} )

            expect(adapter.getName()).toBe('HRM-Mock')
            expect(adapter.getUniqueName()).toBe('HRM-Mock 4461')
            adapter.on('data',onData)
            adapter.updateFrequency=-1; // get every update

            const started = await adapter.start({})
            expect(started).toBeTruthy()           
            
            await sleep(50)
            expect(onData).toHaveBeenCalledWith( expect.objectContaining({interface:'ble', protocol:'hr',name:'HRM-Mock'}),{ heartrate: 60 }  )

            HrMock.setHeartrate(90)
            await sleep(50)
            expect(onData).toHaveBeenCalledWith( expect.objectContaining({interface:'ble', protocol:'hr',name:'HRM-Mock'}),{ heartrate: 90 }  )


        })
    
    })



})