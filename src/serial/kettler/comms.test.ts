import { MockBinding } from "@serialport/binding-mock"
import { EventLogger } from "gd-eventlog"
import KettlerSerialComms from "./comms";
import { SerialPortProvider } from ".."
import { Command } from "../../types/command";
import { KettlerRacerMock, KettlerRacerMockImpl} from './ergo-racer/mock'

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();


describe('KettlerSerialComms',()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
        MockBinding.reset();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as any)
    })

    describe('constructor',()=>{
        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined            
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)
        })
    
    
        beforeEach( ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
        })
    
        test('no settings',()=>{
            let comms = new KettlerSerialComms<Command>({interface:'serial',port:'COM1',logger:new EventLogger('KettlerTest')})
            expect(comms).toBeDefined();
            expect((comms as any).serial).toBeDefined()

        })
            

    })

    describe('open',()=>{

        let comms;
        let open
        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined            
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)
        })

        afterEach( async ()=>{
            if (comms  && comms.serial)
                await comms.serial.closePort( comms.port)
            MockBinding.open = open
        })
    
    
        beforeEach( ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
            open = MockBinding.open
        })
    
        test('port can be opened',async ()=>{
            comms = new KettlerSerialComms<Command>({interface:'serial',port:'COM1',logger:new EventLogger('KettlerTest')})
            const opened = await comms.open()
            expect(opened).toBeTruthy()
            expect(comms.isConnected()).toBeTruthy()

        })

        test('timeout',async ()=>{
            MockBinding.open = (...args) => new Promise( resolve =>  {})

            comms = new KettlerSerialComms<Command>({interface:'serial',port:'COM1',logger:new EventLogger('KettlerTest'), settings:{openTimeout:100}})
            const opened = await comms.open()
            expect(opened).toBeFalsy()
            expect(comms.isConnected()).toBeFalsy()

        })


        test('port does not exist',async ()=>{
            let comms = new KettlerSerialComms<Command>({interface:'serial',port:'COM2',logger:new EventLogger('KettlerTest')})
            const opened = await comms.open()
            expect(opened).toBeFalsy()
            expect(comms.isConnected()).toBeFalsy()

        })


    })

    describe( 'KettlerRacer comamnds',()=> {
        let comms;
        let open
        beforeAll( ()=> {
            KettlerRacerMockImpl.reset()
            SerialPortProvider.getInstance().setBinding('serial', KettlerRacerMock)
        })

        afterEach( async ()=>{
            if (comms  && comms.serial)
                await comms.serial.closePort( comms.port)
        })
    
    
        beforeEach( async ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
            comms = new KettlerSerialComms<Command>({interface:'serial',port:'COM1',logger:new EventLogger('KettlerTest')})
            await comms.open()
        })

        const send = async( message:string ):Promise<{res?,error?}> => {
            return new Promise( done => {
                
                const cmd = {
                    logStr:'', 
                    message, 
                    onResponse: (res)=>{ done({res}) }, 
                    onError: (error)=>{done( {error})},  
                    timeout:50
                }
                comms.send(cmd)    
            })

        }
      
        test('setComputerMode',async ()=>{
            const {res,error} = await send( 'CP' ) 
            expect(res).toBe('ACK')
        })
        
    })

})