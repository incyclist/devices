import { EventLogger } from 'gd-eventlog';
import DaumPremiumAdapter from './adapter'
import { MockBinding } from '@serialport/binding-mock';
import DaumClassicCyclingMode from '../../../modes/daum-classic-standard';
import SerialPortProvider from '../../base/serialport';
import { SerialInterfaceType } from '../../types';
import SerialInterface from '../../base/serial-interface';
import { sleep } from 'incyclist-devices/lib/utils/utils';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe( 'DaumPremiumAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )

        SerialPortProvider.getInstance().setBinding('serial',MockBinding)
        SerialPortProvider.getInstance().setBinding('tcpip',MockBinding)
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as any)

    })

    describe('constructor',()=>{

        test('with serial interface as string',()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            expect(device).toBeDefined();
            expect(device.comms).toBeDefined();
            
            // check simple getters
            expect(device.getName()).toBe('Daum8i')
            expect(device.getPort()).toBe('COM5')
            expect(device.getUniqueName()).toBe('Daum8i (COM5)')
            expect(device.getInterface()).toBe('serial')
            expect(device.getProtocolName()).toBe('Daum Premium')
        })

        test('with tcpip interface as string',()=>{
            const device = new DaumPremiumAdapter( {interface:'tcpip', host:'localhost', port:'1234', protocol:'Daum Premium'})
            expect(device).toBeDefined();
            expect(device.comms).toBeDefined();
            expect(device.comms.serial).toBeInstanceOf(SerialInterface);            

            // check simple getters
            expect(device.getName()).toBe('Daum8i')
            expect(device.getPort()).toBe('localhost:1234')
            expect(device.getUniqueName()).toBe('Daum8i (localhost)')
            expect(device.getInterface()).toBe('tcpip')
            expect(device.getProtocolName()).toBe('Daum Premium')
        })

        test('with tcpip interface without port',()=>{
            const device = new DaumPremiumAdapter( {interface:'tcpip', host:'localhost', protocol:'Daum Premium'})
            expect(device).toBeDefined();
            expect(device.comms).toBeDefined();
            expect(device.comms.serial).toBeInstanceOf(SerialInterface);            

            // check simple getters
            expect(device.getName()).toBe('Daum8i')
            expect(device.getPort()).toBe('localhost:51955')
            expect(device.getUniqueName()).toBe('Daum8i (localhost)')
            expect(device.getInterface()).toBe('tcpip')
            expect(device.getProtocolName()).toBe('Daum Premium')
        })

        test('with interface as object',()=>{
            const serial = SerialInterface.getInstance({ifaceName:'serial'})
            const device = new DaumPremiumAdapter( {interface:serial, port:'COM5', protocol:'Daum Premium'})
            expect(device).toBeDefined();
            expect(device.comms).toBeDefined();
            expect(device.comms.serial).toBe(serial);
        })

        test('unknown interface',()=>{
            let error;
            try {
                const device = new DaumPremiumAdapter( {interface:'XXX', port:'COM5', protocol:'Daum Premium'})
            }
            catch( err) { error = err}
            expect(error).toBeDefined();
        })

    })

    describe('getInterface',()=>{
        let device
        beforeEach( ()=>{
            device = new DaumPremiumAdapter( {interface:'tcpip', host:'localhost', protocol:'Daum Premium'})
        })

        test('tcpip',()=>{
            const res = device.getInterface()
            expect(res).toBe('tcpip')
        })
        test('serial',()=>{
            device.comms.getInterface = jest.fn().mockReturnValue('serial')
            const res = device.getInterface()
            expect(res).toBe('serial')
        })
        test('bike not intitialized',()=>{
            device.comms = null
            const res = device.getInterface()
            expect(res).toBeUndefined()
        })

    })

    describe('getSerialInterface',()=>{
        let device
        beforeEach( ()=>{
            device = new DaumPremiumAdapter( {interface:'tcpip', host:'localhost', protocol:'Daum Premium'})
        })

        test('bike is defined',()=>{
            device.comms = { serial: new SerialInterface({ifaceName:'serial-1'})}
            const res = device.getSerialInterface()
            expect(res.ifaceName).toBe('serial-1')
        })
        test('bike is not defined',()=>{
            device.comms = undefined
            const res = device.getSerialInterface()
            expect(res).toBeUndefined()
        })

    })

    describe('isEqual',()=>{

        describe('serial', ()=>{

            let device
            beforeAll( ()=>{
                device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            })

            test('exact match',()=>{
                const res = device.isEqual({interface:'serial', port:'COM5', protocol:'Daum Premium'})
                expect(res).toBeTruthy()
            })
            test('additional host will be ignored',()=>{
                const res = device.isEqual({interface:'serial', port:'COM5', protocol:'Daum Premium', host:'anything'})
                expect(res).toBeTruthy()
            })
            test('different port',()=>{
                const res = device.isEqual({interface:'serial', port:'COM6', protocol:'Daum Premium'})
                expect(res).toBeFalsy()
            })
            test('different protocol',()=>{
                const res = device.isEqual({interface:'serial', port:'COM5', protocol:'Daum Classic'})
                expect(res).toBeFalsy()
            })
            test('different interface',()=>{
                const res = device.isEqual({interface:'anything', port:'COM5', protocol:'Daum Premium'})
                expect(res).toBeFalsy()
            })
    
        })

        describe('tcpip',()=>{

            let device
            beforeAll( ()=>{
                device = new DaumPremiumAdapter( {interface:'tcpip', host:'localhost', protocol:'Daum Premium'})
            })

            test('exact match',()=>{
                const res = device.isEqual({interface:'tcpip', host:'localhost', protocol:'Daum Premium'})
                expect(res).toBeTruthy()
            })
            test('different host string',()=>{
                const res = device.isEqual({interface:'tcpip', host:'127.0.0.1', protocol:'Daum Premium'})
                expect(res).toBeFalsy()
            })
            test('different port',()=>{
                const res = device.isEqual({interface:'tcpip', host:'localhost', protocol:'Daum Premium', port:123})
                expect(res).toBeFalsy()
            })
            test('diffault port',()=>{
                const res = device.isEqual({interface:'tcpip', host:'localhost', protocol:'Daum Premium', port:51955})
                expect(res).toBeTruthy()
            })
            test('different protocol',()=>{
                const res = device.isEqual({interface:'tcpip', host:'localhost', protocol:'Daum Classic'})
                expect(res).toBeFalsy()
            })
            test('different interface',()=>{
                const res = device.isEqual({interface:'serial', host:'localhost', protocol:'Daum Premium'})
                expect(res).toBeFalsy()
            })

        })

    })

    describe('connect',()=>{
        test('serial success',async ()=>{
            MockBinding.createPort('COM5')
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)

            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            const opened = await device.connect()
            expect(opened).toBeTruthy()
        })

        test('serial failure',async ()=>{
            MockBinding.createPort('COM5')
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)

            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM6', protocol:'Daum Premium'})
            const opened = await device.connect()
            expect(opened).toBeFalsy()
        })

        test('tcpip success',async ()=>{
            MockBinding.createPort('192.168.1.1:51955')
            SerialPortProvider.getInstance().setBinding('tcpip', MockBinding)

            const device = new DaumPremiumAdapter( {interface:'tcpip', host:'192.168.1.1', port:'51955', protocol:'Daum Premium'})
            const opened = await device.connect()
            expect(opened).toBeTruthy()
        })

        test('tcpip failure',async ()=>{
            MockBinding.createPort('192.168.1.1:51955')
            SerialPortProvider.getInstance().setBinding('tcpip', MockBinding)

            const device = new DaumPremiumAdapter( {interface:'tcpip', host:'192.168.2.1', port:'51955', protocol:'Daum Premium'})
            const opened = await device.connect()
            expect(opened).toBeFalsy()
        })


        test('bike already connected',async ()=>{

            const device = new DaumPremiumAdapter( {interface:'tcpip', host:'192.168.2.1', port:'51955', protocol:'Daum Premium'})
            device.comms.isConnected = jest.fn( ()=>true)
            device.comms.connect = jest.fn()

            const opened = await device.connect()
            expect(opened).toBeTruthy()
            expect(device.comms.connect).not.toHaveBeenCalled()
            
        })

        test('bike.connect rejects',async ()=>{

            const device = new DaumPremiumAdapter( {interface:'tcpip', host:'192.168.2.1', port:'51955', protocol:'Daum Premium'})
            device.comms.isConnected = jest.fn( ()=>false)
            device.comms.connect = jest.fn( ()=>Promise.reject( new Error('error')))

            const opened = await device.connect()
            expect(opened).toBeFalsy()
        })


    })

    describe('check',()=>{

        beforeEach( ()=>{
            jest.resetAllMocks()
        })
        test('device available',async ()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.resolve(true))

            device.comms.isConnected = jest.fn( ()=>false)
            device.comms.getDeviceType = jest.fn( ()=>Promise.resolve( 'bike'))
            device.comms.getProtocolVersion = jest.fn( ()=>Promise.resolve( '2.01'))

            const res = await device.check()
            expect(res).toBe(true)
        })


        test('connection failed',async ()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.resolve(false))

            device.comms.isConnected = jest.fn( ()=>false)
            device.comms.getDeviceType = jest.fn( ()=>Promise.resolve( 'bike'))
            device.comms.getProtocolVersion = jest.fn( ()=>Promise.resolve( '2.01'))

            const res = await device.check()

            expect(res).toBe(false)           
        })

        test('connection rejects',async ()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.reject( new Error('some error')))

            device.comms.isConnected = jest.fn( ()=>false)
            device.comms.getDeviceType = jest.fn( ()=>Promise.resolve( 'bike'))
            device.comms.getProtocolVersion = jest.fn( ()=>Promise.resolve( '2.01'))

            const res = await device.check()

            expect(res).toBe(false)
            
        })


        test('device already stoped',async ()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})

            device.isStopped = jest.fn( ()=>true)

            const res = await device.check()

            expect(res).toBe(false)
        })


    })

    describe('pause',()=>{
        let device
        beforeEach( ()=>{
            MockBinding.createPort('COM5')
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            device.comms.pauseLogging = jest.fn ()
        })

        test('not paused',async()=>{
            device.paused = false;

            await device.pause()

            expect(device.paused).toBe(true)
            expect(device.comms.pauseLogging).toHaveBeenCalled()
        } )

        test('already paused',async()=>{           
            device.paused = true;

            await device.pause()

            expect(device.paused).toBe(true)
            expect(device.comms.pauseLogging).toHaveBeenCalled() // will call this always - reagrdless of previous pause state

        } )

    })

    describe('resume',()=>{

        let device
        beforeEach( ()=>{
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            device.comms.resumeLogging = jest.fn ()
        })

        test('not paused',async()=>{
            device.paused = false;

            await device.resume()

            expect(device.paused).toBe(false)
            expect(device.comms.resumeLogging).toHaveBeenCalled()

        } )

        test('paused',async()=>{           
            device.paused = true;

            await device.resume()

            expect(device.paused).toBe(false)
            expect(device.comms.resumeLogging).toHaveBeenCalled() // will call this always - reagrdless of previous pause state

        } )
    })
    describe('start',()=>{
        let device
        beforeEach( ()=>{
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            device.getDeviceInfo = jest.fn().mockResolvedValue(true)
        })

        afterEach( async ()=> {
            if (device)
                await device.stop()
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


        test('normal start',async ()=>{

            device.performStart = jest.fn().mockResolvedValue(true)
            const {started,error} = await run()

            expect(device.performStart).toHaveBeenCalledWith(undefined,false,false)
            expect(device.started).toBeTruthy()
            expect(device.paused).toBeFalsy()

            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
        })


        test('performStart after previous check',async ()=>{
            device.performStart = jest.fn ().mockResolvedValue(true)
            device.started = true
            device.paused = true;

            const {started,error} = await run()

            expect(device.performStart).toHaveBeenCalledWith(undefined, true,true)
            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
        })


        test('performStart failure',async ()=>{
            device.performStart = jest.fn ( ()=>Promise.reject(new Error('test')))
            const {started,error} = await run()

            expect(started).toBeFalsy();
            expect(error).toBeDefined()
            expect(error?.message).toBe('could not start device, reason:test')
        })
    })


    describe('performStart',()=>{
        let device, bike
        beforeEach( ()=>{
            MockBinding.createPort('COM5')
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})            
            device.startUpdatePull = jest.fn()

            device.getStartRetries = jest.fn().mockReturnValue(1)
            device.getStartRetryTimeout = jest.fn().mockReturnValue(10)

            bike = device.comms
            device.stop = jest.fn( ()=>Promise.resolve(true) )
            device.resume = jest.fn( ()=>Promise.resolve(true) )
            bike.getDeviceType = jest.fn(()=>Promise.resolve('bike'))
            bike.getProtocolVersion = jest.fn(()=>Promise.resolve('123'))
            bike.programUpload = jest.fn( ()=>Promise.resolve(true))
            bike.startProgram = jest.fn( ()=>Promise.resolve(true))
            bike.setPerson = jest.fn( ()=>Promise.resolve(true))
            bike.setGear = jest.fn( ()=>Promise.resolve(10))
        })

        afterEach( async ()=> {
            await device.stop()
        })

        const run = async(props?,isReperformStart?) => {
            let started:boolean = false;
            let error:Error|undefined = undefined

            try {
                started = await device.performStart(props,isReperformStart)
            }
            catch(err) {
                error = err                
            }
            return {started,error}
        }

        /*
        describe('ERG Mode', ()=>{
            beforeEach( ()=>{
                
                device.cyclingMode = new ERGCyclingMode(device)
            })

            afterEach( ()=>{
                
                device.comms.close().catch()
                jest.useRealTimers()
            })

            test('initial performStart with user and bike settings ',async ()=>{
                device.paused = true;
                
                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, false)
                expect(device.stop).not.toHaveBeenCalled()
                expect(started).toBeTruthy()
                expect(error).toBeUndefined()
                expect(device.startUpdatePull).toBeCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
            })

            test('one of the init commands fails permanently  ',async ()=>{

                device._startRetryTimeout = 50;
                bike.getDeviceType = jest.fn(()=>Promise.reject( new Error('ERR')))
                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, true)


                expect(started).toBeFalsy()
                expect(error).toBeDefined()
                expect(device.startUpdatePull).not.toBeCalled();
            })

            test('one of the init commands fails temporarily  ',async ()=>{

                device._startRetryTimeout = 50;
                bike.getDeviceType = jest.fn()
                    .mockRejectedValueOnce(new Error('ERR'))
                    .mockReturnValue(Promise.resolve('bike'))
                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, true)

                expect(started).toBeTruthy()
                expect(error).toBeUndefined()
            })

            test('initial performStart with user and bike settings ',async ()=>{
                device.paused = true;
                
                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, false)
                expect(device.stop).not.toHaveBeenCalled()
                expect(started).toBeTruthy()
                expect(error).toBeUndefined()
                expect(device.startUpdatePull).toBeCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
            })

        })
        */

        test('connection fails',async ()=>{
            device.connect = jest.fn().mockResolvedValue(false)         
            device.reconnect   = jest.fn().mockResolvedValue(false)

            const {started,error} = await run( )
            expect(started).toBeFalsy()
            expect(error).toMatchObject({message:'not connected'})
            expect(device.reconnect).not.toHaveBeenCalled()

        })

        test('retry connection fails',async ()=>{
            device.connect = jest.fn().mockResolvedValue(true)         
            device.reconnect   = jest.fn().mockResolvedValue(true)
            device.comms.getDeviceType = jest.fn().mockRejectedValue(new Error('Timeout'))
            device.getStartRetries = jest.fn().mockReturnValue(2)

            const {started,error} = await run( )
            expect(started).toBeFalsy()
            expect(device.reconnect).toHaveBeenCalled()
            expect(error).toMatchObject({message:'Timeout'})

        })


        test('stop during start attempt',async ()=>{
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})            
            device.connect = jest.fn().mockResolvedValue(true)         
            device.reconnect   = jest.fn().mockResolvedValue(true)
            device.comms.getDeviceType = jest.fn( async ()=> { 
                await sleep(5000); 
                throw ( new Error('RESP timeout'))
            }) 

            const startPromise = device.performStart()
            await sleep(200)

            const t1 = Date.now()
            device.stop()

            const res = await startPromise
            expect(res).toBe(false)
            console.log(Date.now()-t1)

            


        })


        describe('Daum Classic Mode - EPP not supported', ()=>{
            beforeEach( ()=>{
                const cyclingMode = new DaumClassicCyclingMode(device)
                device.getCyclingMode = jest.fn().mockReturnValue( cyclingMode)
                cyclingMode.getModeProperty=jest.fn().mockReturnValue(false)
                cyclingMode.setSettings=jest.fn()
                cyclingMode.getSetting=jest.fn((key)=>key==='bikeType'? 'race' : undefined)
                cyclingMode.getName=jest.fn().mockReturnValue('Mock')

                bike.programUpload = jest.fn().mockReturnValue(true)
                bike.startProgram = jest.fn().mockReturnValue(true)
                bike.setGear = jest.fn().mockReturnValue(10)
            })

            afterEach( ()=>{
                
                device.comms.close().catch()
                jest.useRealTimers()
            })

            test('initial performStart without properties',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                const {started,error} = await run( )
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).toHaveBeenCalled()
                expect(device.startUpdatePull).toBeCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).not.toHaveBeenCalled()
                expect(bike.startProgram).not.toHaveBeenCalled()
                expect(bike.setGear).toHaveBeenCalledWith(10)
            })

        })

        describe('Daum Classic Mode - EPP supported', ()=>{
            beforeEach( ()=>{
                let cyclingMode = new DaumClassicCyclingMode(device)
                cyclingMode.getModeProperty=jest.fn().mockReturnValue(true)
                cyclingMode.setSettings=jest.fn()
                cyclingMode.getSetting=jest.fn((key)=>key==='bikeType'? 'race' : undefined)
                cyclingMode.getName=jest.fn().mockReturnValue('Mock')
                device.getCyclingMode = jest.fn().mockReturnValue( cyclingMode)

                bike.programUpload = jest.fn().mockReturnValue(true)
                bike.startProgram = jest.fn().mockReturnValue(true)
                bike.setGear = jest.fn().mockReturnValue(10)
            })

            afterEach( ()=>{
                
                device.comms.close().catch()
                jest.useRealTimers()
            })

            test('reperformStart without properties',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                const {started,error} = await run( {},true)
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).toHaveBeenCalled()
                expect(device.startUpdatePull).toHaveBeenCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).not.toHaveBeenCalled()
                expect(bike.startProgram).not.toHaveBeenCalled()
                expect(bike.setGear).not.toHaveBeenCalled()
            })

            test('initial performStart without properties',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                const {started,error} = await run( )
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).toHaveBeenCalled()
                expect(device.startUpdatePull).toHaveBeenCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).not.toHaveBeenCalled()
                expect(bike.startProgram).not.toHaveBeenCalled()
                expect(bike.setGear).not.toHaveBeenCalled()
            })

            test('resume after pause',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                device.paused = true;

                const {started,error} = await run( )
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).toHaveBeenCalled()
                expect(device.startUpdatePull).toHaveBeenCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).not.toHaveBeenCalled()
                expect(bike.startProgram).not.toHaveBeenCalled()
            })

            test('initial performStart with user and bike settings ',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, false)
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).toHaveBeenCalled()
                expect(device.startUpdatePull).toHaveBeenCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).not.toHaveBeenCalled()
                expect(bike.startProgram).not.toHaveBeenCalledWith(0)
            })

            test('initial performStart with route ',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                const route = {programId:123}
                const {started,error} = await run( {route}, false)
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).toHaveBeenCalled()
                expect(device.startUpdatePull).toHaveBeenCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).toHaveBeenCalled()
                expect(bike.startProgram).toHaveBeenCalledWith(123)
            })


            test('initial performStart without route ',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                
                const {started,error} = await run( {}, false)
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).toHaveBeenCalled()
                expect(device.startUpdatePull).toHaveBeenCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).not.toHaveBeenCalled()
                expect(bike.startProgram).not.toHaveBeenCalledWith(123)
            })


            test('Epp upload commands fails permanently  ',async ()=>{

                device._startRetryTimeout = 50;
                bike.programUpload.mockResolvedValue(false)

                const route = {programId:123}
                const {started,error} = await run( {route, user: {weight:100}, bikeSettings:{weight:15}}, true)


                expect(started).toBeFalsy()
                expect(error).toBeDefined()
                expect(error?.message).toBe('Epp Upload failed')
            })
            test('startProgram commands fails permanently  ',async ()=>{

                device._startRetryTimeout = 50;
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(false)
                
                const route = {programId:123}
                const {started,error} = await run( {route,user: {weight:100}, bikeSettings:{weight:15}}, true)


                expect(started).toBeFalsy()
                expect(error).toBeDefined()
                expect(error?.message).toBe('Epp start failed')
            })
            test('bike communication to throw error',async ()=>{

                device._startRetryTimeout = 50;
                bike.programUpload = jest.fn( ()=> {throw new Error('XXXXX')})
                bike.startProgram.mockResolvedValue(false)
                
                const route = {programId:123}
                const {started,error} = await run( {route,user: {weight:100}, bikeSettings:{weight:15}}, true)


                expect(started).toBeFalsy()
                expect(error).toBeDefined()
                expect(error?.message).toBe('XXXXX')
            })


            test('one of the init commands fails temporarily  ',async ()=>{
                bike.programUpload.mockResolvedValueOnce(false).mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)
                device.getStartRetries= jest.fn().mockReturnValue(5)
                
                const route = {programId:123}
                const {started,error} = await run( {route,user: {weight:100}, bikeSettings:{weight:15}}, true)

                expect(started).toBeTruthy()
                expect(error).toBeUndefined()
            })


        })


    })

    describe('updateData',()=>{})
    describe('getCurrentBikeData',()=>{

        let device, bike
        beforeEach( ()=>{
            MockBinding.createPort('COM5')
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})            
            device.startUpdatePull = jest.fn()

            bike = device.comms
            device.stop = jest.fn( ()=>Promise.resolve(true) )
            bike.isConnected = jest.fn(()=>true)
            bike.connect = jest.fn(()=>true)
            bike.getTrainingData= jest.fn()
        })        

        test('already connected',async ()=>{
            await device.getCurrentBikeData() 
            expect(bike.connect).not.toHaveBeenCalled();
            expect(bike.getTrainingData).toHaveBeenCalled();
        })
        test('not connected',async ()=>{
            bike.isConnected = jest.fn(()=>false)
            await device.getCurrentBikeData() 
            expect(bike.connect).toHaveBeenCalled();
            expect(bike.getTrainingData).toHaveBeenCalled();

        })

        test('not connected, reconnect fails',async ()=>{
            bike.isConnected = jest.fn(()=>false)
            bike.connect = jest.fn(()=>Promise.resolve(false))

            let error;
            try {
                await device.getCurrentBikeData() 
            }
            catch(err) { error=err}

            expect(error).toBeDefined()
            expect(bike.connect).toHaveBeenCalled();
            expect(bike.getTrainingData).not.toHaveBeenCalled();

        })

    })

    describe('requiresProgramUpload',()=>{

        let device
        beforeEach( ()=>{
            MockBinding.createPort('COM5')
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})            
        })        

        test('with Epp Support',async ()=>{
            device.getCyclingMode = jest.fn().mockReturnValue( { getModeProperty:jest.fn().mockReturnValue(true) })
            const res = device.requiresProgramUpload()
            expect(res).toBeTruthy()
        })

        test('without Epp Support',async ()=>{
            device.getCyclingMode = jest.fn().mockReturnValue( { getModeProperty:jest.fn().mockReturnValue(false) })
            const res = device.requiresProgramUpload()
            expect(res).toBeFalsy()
        })

        test('No cycling mode set',async ()=>{
            device.getCyclingMode = jest.fn().mockReturnValue(undefined)
            const res = device.requiresProgramUpload()
            expect(res).toBeFalsy()
        })

    })

})