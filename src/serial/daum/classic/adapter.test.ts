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

    /*

    describe('getCurrentBikeData',()=>{

        let a: DaumClassicAdapter;
        let initData: any;
        let bikeComms: any
        beforeEach( ()=>{
            bikeComms = { 
                getPort: jest.fn( ()=>'COMX'),
            }
            initData = DaumClassicAdapter.prototype.initData;    
            DaumClassicAdapter.prototype.initData =  jest.fn()
            a = new DaumClassicAdapter( new DaumClassicProtocol(),bikeComms);
        })
        afterEach( ()=>{
            DaumClassicAdapter.prototype.initData =  initData
        })

        test('mormal flow: does not check connection',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>true)
            bikeComms.runData = jest.fn( ()=>({gear:10, power:100, speed:30}))
            const res = await a.getCurrentBikeData()
            expect(res).toMatchObject({gear:10, power:100, speed:30})
            expect(bikeComms.isConnected).not.toHaveBeenCalled()

        })
        test('not connected: will not be checked',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.runData = jest.fn( ()=>({gear:10, power:100, speed:30}))
            await a.getCurrentBikeData()
            expect(bikeComms.isConnected).not.toHaveBeenCalled()
            expect(bikeComms.runData).toHaveBeenCalled()

        })

        test('error in getCurrentBikeData',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.runData = jest.fn( ()=> Promise.reject(new Error('some error')))
            try {
                await a.getCurrentBikeData()
                fail('should have thrown an error')
            } catch (e) {
                expect(e.message).toBe('some error')
            }

        })

        test('getCurrentBikeData does not resolve/reject promise: does not timeout',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.runData = jest.fn( ()=> new Promise(()=>{}) )
            
            let error;
            const fn = ()=> {
                a.getCurrentBikeData().catch( (err)=> {throw (err)})
                jest.advanceTimersByTime(6000)

                expect(error).toBeUndefined()
                return Promise.resolve()
            }


            try {
                await fn()
            } catch (e) {
                error = e;
            }

        })

    })



    describe('sendRequest',()=>{
        let a: DaumClassicAdapter;
        let bikeComms:any;
    
        beforeEach( async ()=>{
            bikeComms = new BikeInterface({port:'COMX'})   
            bikeComms.setSlope = jest.fn( (slope,bike=0)=>({bike,slope}))
            bikeComms.setPower = jest.fn( (power,bike=0)=>({bike,power}));
            a = new DaumClassicAdapter( new DaumClassicProtocol(),bikeComms);
        })

        test('slope has been set',async ()=>{
            const res = await a.sendRequest({slope:10})
            expect(bikeComms.setSlope).toHaveBeenCalledWith(10)
            expect(bikeComms.setPower).not.toHaveBeenCalled()
            expect(res).toEqual({slope:10})
        })
        test('power has been set',async ()=>{
            const res = await a.sendRequest({targetPower:100})
            expect(bikeComms.setSlope).not.toHaveBeenCalled()
            expect(bikeComms.setPower).toHaveBeenCalledWith(100)
            expect(res).toEqual({targetPower:100})
        })
        test('power and slope ',async ()=>{
            const res= await a.sendRequest({slope:10,targetPower:100})
            expect(bikeComms.setSlope).toHaveBeenCalledWith(10)
            expect(bikeComms.setPower).toHaveBeenCalledWith(100)
            expect(res).toEqual({slope:10,targetPower:100})
        })
        test('no request ',async ()=>{
            const res = await a.sendRequest({})
            expect(bikeComms.setSlope).not.toHaveBeenCalled()
            expect(bikeComms.setPower).not.toHaveBeenCalled()
            expect(res).toEqual({})
        })
        test('error when sending command',async ()=>{
            bikeComms.setSlope = jest.fn( ()=>{throw new Error('some error')})            
            // eslint-disable-next-line no-throw-literal
            bikeComms.setPower = jest.fn( ()=>{throw 'power error'})
            a.logger.logEvent  = jest.fn()
            const res = await a.sendRequest({slope:10})
            expect(res).toBeUndefined()
            expect(a.logger.logEvent).toHaveBeenCalledWith(expect.objectContaining({message:'sendRequest error',error:'some error'}))

            
            await a.sendRequest({targetPower:100})            
            expect(a.logger.logEvent).toHaveBeenLastCalledWith(expect.objectContaining({message:'sendRequest error',error:'power error'}))

        })

    })

    describe('stop' ,()=>{
        let a: DaumClassicAdapter;
        let bikeComms:any;
    
        beforeEach( async ()=>{
            bikeComms = new BikeInterface({port:'COMX'})   
            bikeComms.setSlope = jest.fn( (slope,bike=0)=>({bike,slope}))
            bikeComms.setPower = jest.fn( (power,bike=0)=>({bike,power}));
            a = new DaumClassicAdapter( new DaumClassicProtocol(),bikeComms);
        })


        test('not stopped',  async ()=>{
            a.logger.logEvent  = jest.fn()
            a.stopped = false;
            bikeComms.queue.enqueue({a:1})
            bikeComms.queue.enqueue({a:2})
            const res = await a.stop()
            expect(res).toBeTruthy()
            expect(a.stopped).toBeTruthy()
            expect(bikeComms.queue.isEmpty()).toBeTruthy()

    
        })

        test('already stopped',  async ()=>{
            a.logger.logEvent  = jest.fn()
            a.stopped = true;
            const res = await a.stop()
            expect(res).toBeTruthy()
            expect(a.stopped).toBeTruthy()

    
        })


    })

*/
})