import { MockBinding } from "@serialport/binding-mock";
import { EventLogger } from "gd-eventlog";
import { DaumClassicAdapter } from "../..";
import SerialPortProvider from "../../serialport";
import DaumClassicCyclingMode from "./modes/daum-classic";
import DaumPowerMeterCyclingMode from "../DaumPowerMeterCyclingMode";
import ERGCyclingMode from "../ERGCyclingMode";
import SmartTrainerCyclingMode from "../SmartTrainerCyclingMode";
import { DaumClassicMock, DaumClassicMockImpl, DaumClassicSimulator } from "./mock";

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
        await device.close().catch()
    })

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

    test('start',async ()=>{
        const res = await device.start()
        expect(res).toBeTruthy()
        
    })



})