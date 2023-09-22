import { MockBinding } from "@serialport/binding-mock";
import { EventLogger } from "gd-eventlog";
import { DaumClassicAdapter } from "../..";
import SerialPortProvider from "../../serialport";
import DaumClassicCyclingMode from "./modes/daum-classic";
import DaumPowerMeterCyclingMode from "../DaumPowerMeterCyclingMode";
import ERGCyclingMode from "../ERGCyclingMode";
import SmartTrainerCyclingMode from "../SmartTrainerCyclingMode";
import { DaumClassicMock, DaumClassicMockImpl, DaumClassicSimulator } from "./mock";
import { sleep } from "../../../utils/utils";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();


describe('DaumClassicAdapter #integration',()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } );
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as any)

    })

    let simulator, device;
    beforeEach( ()=> {
        MockBinding.reset();
        MockBinding.createPort('COM1')

        simulator = new DaumClassicSimulator();
        DaumClassicMockImpl.reset();        
        SerialPortProvider.getInstance().setBinding('serial',DaumClassicMock)
        DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)           

        device = new DaumClassicAdapter( {interface:'serial', port:'COM1', protocol:'Daum Premium'})
    })

    afterEach( async ()=>{
        try {
            await device.close()
        }
        catch {}
    },50000)

    test('constructor',()=>{
        // check simple getters
        expect(device.getName()).toBe('Daum Classic')
        expect(device.getPort()).toBe('COM1')
        expect(device.getInterface()).toBe('serial')
        expect(device.getProtocolName()).toBe('Daum Classic')
        
        const cm = device.getSupportedCyclingModes()
        expect(cm).toContain(ERGCyclingMode)
        expect(cm).toContain(SmartTrainerCyclingMode)
        expect(cm).toContain(DaumPowerMeterCyclingMode)
        expect(cm).toContain(DaumClassicCyclingMode)
    })

    test('check',async ()=>{
        const res = await device.check()
        expect(res).toBeTruthy()
        expect(device.getName()).toBe('Daum 8080')            
    })

    test.skip('check with device not responding',async ()=>{

        simulator.simulateNoResponse(100)

        // start 1st check
        device.check()
        
        // simulate chancel after 1s
        await sleep(6000)
        device.getBike().serial.closePort('COM1')

        // run 2nd check
        await sleep(9000)
        const res = await device.check()
        
        expect(res).toBeFalsy()
    },50000)

    test('start',async ()=>{
        const res = await device.start()
        expect(res).toBeTruthy()
        
    },5000)



})