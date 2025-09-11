import { EventLogger } from 'gd-eventlog';
import DaumClassicAdapter from './adapter';
import { MockBinding } from '@serialport/binding-mock';
import SerialPortProvider from '../../base/serialport';
import { sleep } from '../../../utils/utils';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();
describe( 'DaumClassicAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
            SerialPortProvider.getInstance().setBinding('serial',MockBinding)

        jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as never)
        jest.useRealTimers();
    })

    describe('check',()=>{

        beforeEach( ()=>{
            jest.resetAllMocks()
        })
        test('device available',async ()=>{
            const device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.resolve(true))


            device.getComms().isConnected = jest.fn( ()=>false)
            device.getComms().getAddress = jest.fn().mockResolvedValue({bike:0})
            device.getComms().getVersion = jest.fn().mockResolvedValue({bike:0,serialNo:'123', cockpit:'8008'})

            const res = await device.check()
            expect(res).toBe(true)
        })


        test('connection failed',async ()=>{
            const device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.resolve(false))

            device.getComms().isConnected = jest.fn( ()=>false)
            device.getComms().getAddress = jest.fn().mockResolvedValue({bike:0})
            device.getComms().getVersion = jest.fn().mockResolvedValue({bike:0,serialNo:'123', cockpit:'8008'})

            const res = await device.check()

            expect(res).toBe(false)           
        })

        test('connection rejects',async ()=>{
            const device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.reject( new Error('some error')))

            device.getComms().isConnected = jest.fn( ()=>false)
            device.getComms().getAddress = jest.fn().mockResolvedValue({bike:0})
            device.getComms().getVersion = jest.fn().mockResolvedValue({bike:0,serialNo:'123', cockpit:'8008'})

            const res = await device.check()

            expect(res).toBe(false)
            
        })


        test('device already stoped',async ()=>{
            const device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})

            device.isStopped = jest.fn( ()=>true)

            const res = await device.check()

            expect(res).toBe(false)
        })


    })

    describe('start',()=>{
        let device
        beforeEach( ()=>{
            device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})
            device.performStart = jest.fn().mockResolvedValue(true)
            device.getComms().getVersion = jest.fn().mockResolvedValue({serialNo:'Test',cockpit:'Test'})
        })

        afterEach( ()=> {
            device.reset()
        })

        const run = async(props?) => {
            let started:boolean = false;
            let error:Error|undefined = undefined

            try {
                started = await device.start(props)
            }
            catch(err) {
                error = err                
            }
            return {started,error}
        }


        test('initial launch ok',async ()=>{
            const {started,error} = await run()

            expect(device.performStart).toHaveBeenCalledWith(undefined, false,false)
            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
            expect(device.started).toBe(true)
        })

        test('relaunch ok',async ()=>{
            device.started = true
            const {started,error} = await run()

            expect(device.performStart).toHaveBeenCalledWith(undefined, true,false)
            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
            expect(device.started).toBe(true)
        })

    })

    describe('performStart',()=>{
        let device
        beforeEach( ()=>{
            device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})
            device.getComms().resetDevice = jest.fn().mockResolvedValue(true)
            device.getComms().setProg = jest.fn( async ()=> { 
                await sleep(500); 
                throw ( new Error('RESP timeout'))
            }) 
            device.getComms().getVersion = jest.fn().mockResolvedValue({serialNo:'Test',cockpit:'Test'})
            device.getComms().isConnected = jest.fn().mockReturnValue(true)
            jest.useRealTimers()

        })

        afterEach( ()=> {
            jest.resetAllMocks()
        })

        test('stop during start attempt',async ()=>{
            const startPromise = device.performStart()
            await sleep(200)

            const t1 = Date.now()
            device.stop()

            const res = await startPromise
            expect(res).toBe(false)
            console.log(Date.now()-t1)

            


        })
    })
})