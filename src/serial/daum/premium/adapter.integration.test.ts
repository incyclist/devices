import { MockBinding } from "@serialport/binding-mock";
import { EventLogger } from "gd-eventlog";
import SerialPortProvider from "../../base/serialport";
import DaumPowerMeterCyclingMode from "../../../modes/daum-power";
import ERGCyclingMode from "../../../modes/daum-erg";
import SmartTrainerCyclingMode from "../../../modes/daum-smarttrainer";
import { Daum8iMock, Daum8iMockImpl, Daum8MockSimulator } from "./mock";
import DaumClassicCyclingMode from "../../../modes/daum-premium-standard";
import DaumPremiumAdapter from "./adapter";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();


describe('DaumPremiumAdapter #integration',()=>{
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

        simulator = new Daum8MockSimulator();
        Daum8iMockImpl.reset();        
        SerialPortProvider.getInstance().setBinding('serial',Daum8iMock)
        Daum8iMockImpl.getInstance().setSimulator('COM1',simulator)           

        device = new DaumPremiumAdapter( {interface:'serial', port:'COM1', protocol:'Daum Premium'})
    })

    afterEach( async ()=>{
        try {
            await device.close()
            await device.stop();
        }
        catch(err) {
            console.log('~~~ ERROR',err)
        }
    },5000)

    test('constructor',()=>{
        // check simple getters
        expect(device.getName()).toBe('Daum8i')
        expect(device.getPort()).toBe('COM1')
        expect(device.getInterface()).toBe('serial')
        expect(device.getProtocolName()).toBe('Daum Premium')
        
        const cm = device.getSupportedCyclingModes()
        expect(cm).toContain(ERGCyclingMode)
        expect(cm).toContain(SmartTrainerCyclingMode)
        expect(cm).toContain(DaumPowerMeterCyclingMode)
        expect(cm).toContain(DaumClassicCyclingMode)
    })

    test('check',async ()=>{
        const res = await device.check()
        expect(res).toBeTruthy()
        expect(device.getName()).toBe('Daum8i')            
    })


    test('start after stop',async ()=>{
        await device.check()
        await device.pause()
        await device.stop()

        const res = await device.start()
        expect(res).toBeTruthy()
        expect(device.getName()).toBe('Daum8i')            
    })

    test('check with temporary error',async ()=>{
        simulator.simulateChecksumError()
        
        const res = await device.check()
        expect(res).toBeTruthy()
        expect(device.getName()).toBe('Daum8i')            
        
    })


})