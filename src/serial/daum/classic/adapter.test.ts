import { EventLogger } from 'gd-eventlog';
import DaumClassicAdapter from './adapter';
import { MockBinding } from '@serialport/binding-mock';
import { SerialPortProvider } from '../..';

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

            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.getAddress = jest.fn( ()=>Promise.resolve( 0))
            device.bike.getVersion = jest.fn( ()=>Promise.resolve( {serialNo:'123', cockpit:'8008'}))

            const res = await device.check()
            expect(res).toBe(true)
        })


        test('connection failed',async ()=>{
            const device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.resolve(false))

            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.getAddress = jest.fn( ()=>Promise.resolve( 0))
            device.bike.getVersion = jest.fn( ()=>Promise.resolve( {serialNo:'123', cockpit:'8008'}))

            const res = await device.check()

            expect(res).toBe(false)           
        })

        test('connection rejects',async ()=>{
            const device = new DaumClassicAdapter( {interface:'serial', port:'COM5', protocol:'Daum Classic'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.reject( new Error('some error')))

            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.getAddress = jest.fn( ()=>Promise.resolve( 0))
            device.bike.getVersion = jest.fn( ()=>Promise.resolve( {serialNo:'123', cockpit:'8008'}))

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
            device.bike.getVersion = jest.fn().mockResolvedValue({serialNo:'Test',cockpit:'Test'})
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

            expect(device.performStart).toHaveBeenCalledWith(undefined, false)
            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
            expect(device.started).toBe(true)
        })

        test('relaunch ok',async ()=>{
            device.started = true
            const {started,error} = await run()

            expect(device.performStart).toHaveBeenCalledWith(undefined, true)
            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
            expect(device.started).toBe(true)
        })

    })
})