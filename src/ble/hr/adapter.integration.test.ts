import { AdapterFactory, InterfaceFactory } from "../../"
import { MockLogger} from '../../../test/logger'
import { DeviceSettings } from "../../types/device"
import { sleep } from "../../utils/utils"
import { MockBinding } from "../bindings"
import { HrMock } from "./mock"

describe( 'BleHrAdapter #Integration',()=>{
    let ble;

    beforeAll( async ()=>{
        ble = InterfaceFactory.create('ble',{logger:MockLogger,binding:MockBinding})
    })

    describe('start',()=>{
        let adapter;
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
            const adapter = AdapterFactory.create( {interface:'ble', protocol:'hr',name:'HRM-Mock'} as DeviceSettings)
            adapter.on('data',onData)
            adapter.updateFrequency=-1; // get every update

            const started = await adapter.start({})
            expect(started).toBeTruthy()           
            
            await sleep(50)
            expect(onData).toHaveBeenCalledWith( {interface:'ble', protocol:'hr',name:'HRM-Mock'},{ heartrate: 60 }  )

            HrMock.setHeartrate(90)
            await sleep(50)
            expect(onData).toHaveBeenCalledWith( {interface:'ble', protocol:'hr',name:'HRM-Mock'},{ heartrate: 90 }  )


        })
    
    })



})