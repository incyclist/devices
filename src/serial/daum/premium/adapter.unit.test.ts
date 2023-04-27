import { EventLogger } from 'gd-eventlog';
import DaumPremiumAdapter from './adapter'
import { MockBinding } from '@serialport/binding-mock';
import { SerialInterface, SerialPortProvider } from '../..';
import { CyclingModeBase } from '../../../modes/cycling-mode';

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
            expect(device.bike).toBeDefined();
            expect(device.bike.serial).toBeInstanceOf(SerialInterface);         
            
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
            expect(device.bike).toBeDefined();
            expect(device.bike.serial).toBeInstanceOf(SerialInterface);            

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
            expect(device.bike).toBeDefined();
            expect(device.bike.serial).toBeInstanceOf(SerialInterface);            

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
            expect(device.bike).toBeDefined();
            expect(device.bike.serial).toBe(serial);
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
        test('serial',()=>{

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
            device.bike.isConnected = jest.fn( ()=>true)
            device.bike.connect = jest.fn()

            const opened = await device.connect()
            expect(opened).toBeTruthy()
            expect(device.bike.connect).not.toHaveBeenCalled()
            
        })

        test('bike.connect rejects',async ()=>{

            const device = new DaumPremiumAdapter( {interface:'tcpip', host:'192.168.2.1', port:'51955', protocol:'Daum Premium'})
            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.connect = jest.fn( ()=>Promise.reject( new Error('error')))

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

            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.getDeviceType = jest.fn( ()=>Promise.resolve( 'bike'))
            device.bike.getProtocolVersion = jest.fn( ()=>Promise.resolve( '2.01'))

            const res = await device.check()
            expect(res).toBe(true)
        })


        test('connection failed',async ()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.resolve(false))

            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.getDeviceType = jest.fn( ()=>Promise.resolve( 'bike'))
            device.bike.getProtocolVersion = jest.fn( ()=>Promise.resolve( '2.01'))

            const res = await device.check()

            expect(res).toBe(false)           
        })

        test('connection rejects',async ()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})

            device.isStopped = jest.fn( ()=>false)
            device.connect = jest.fn( ()=>Promise.reject( new Error('some error')))

            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.getDeviceType = jest.fn( ()=>Promise.resolve( 'bike'))
            device.bike.getProtocolVersion = jest.fn( ()=>Promise.resolve( '2.01'))

            const res = await device.check()

            expect(res).toBe(false)
            
        })


        test('device already stoped',async ()=>{
            const device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})

            device.isStopped = jest.fn( ()=>true)
            device.connect = jest.fn( ()=>Promise.resolve(true))

            device.bike.isConnected = jest.fn( ()=>false)
            device.bike.getDeviceType = jest.fn( ()=>Promise.resolve( 'bike'))
            device.bike.getProtocolVersion = jest.fn( ()=>Promise.resolve( '2.01'))

            const res = await device.check()

            expect(res).toBe(true)
        })


    })

    describe('pause',()=>{
        let device
        beforeEach( ()=>{
            MockBinding.createPort('COM5')
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            device.bike.pauseLogging = jest.fn ()
        })

        test('not paused',async()=>{
            device.paused = false;

            await device.pause()

            expect(device.paused).toBe(true)
            expect(device.bike.pauseLogging).toHaveBeenCalled()
        } )

        test('already paused',async()=>{           
            device.paused = true;

            await device.pause()

            expect(device.paused).toBe(true)
            expect(device.bike.pauseLogging).toHaveBeenCalled() // will call this always - reagrdless of previous pause state

        } )

    })

    describe('resume',()=>{

        let device
        beforeEach( ()=>{
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            device.bike.resumeLogging = jest.fn ()
        })

        test('not paused',async()=>{
            device.paused = false;

            await device.resume()

            expect(device.paused).toBe(false)
            expect(device.bike.resumeLogging).toHaveBeenCalled()

        } )

        test('paused',async()=>{           
            device.paused = true;

            await device.resume()

            expect(device.paused).toBe(false)
            expect(device.bike.resumeLogging).toHaveBeenCalled() // will call this always - reagrdless of previous pause state

        } )
    })
    describe('startRide',()=>{
        let device
        beforeEach( ()=>{
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            device.launch = jest.fn ()
        })

        const run = async(props?) => {
            let started:boolean = false;
            let error:Error|undefined = undefined

            try {
                started = await device.startRide(props)
            }
            catch(err) {
                error = err                
            }
            return {started,error}
        }


        test('launch ok',async ()=>{
            const {started,error} = await run()

            expect(device.launch).toHaveBeenCalledWith({}, true)
            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
        })


        test('launch ok',async ()=>{
            const {started,error} = await run()

            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
        })

        test('launch failure',async ()=>{
            device.launch = jest.fn ( ()=>Promise.reject(new Error('could not start device, reason:test')))
            const {started,error} = await run()

            expect(started).toBeFalsy();
            expect(error).toBeDefined()
            expect(error?.message).toBe('could not start device, reason:test')
        })
    })


    describe('start',()=>{
        let device
        beforeEach( ()=>{
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})
            device.launch = jest.fn ()
        })

        const run = async() => {
            let started:boolean = false;
            let error:Error|undefined = undefined

            try {
                started = await device.start()
            }
            catch(err) {
                error = err                
            }
            return {started,error}
        }

        test('launch ok',async ()=>{
            const {started,error} = await run()

            expect(device.launch).toHaveBeenCalledWith({}, false)
            expect(started).toBeTruthy();
            expect(error).toBeUndefined()
        })

        test('launch failure',async ()=>{
            device.launch = jest.fn ( ()=>Promise.reject(new Error('could not start device, reason:test')))
            const {started,error} = await run()

            expect(started).toBeFalsy();
            expect(error).toBeDefined()
            expect(error?.message).toBe('could not start device, reason:test')
        })
    })

    describe('launch',()=>{
        let device, bike
        beforeEach( ()=>{
            MockBinding.createPort('COM5')
            device = new DaumPremiumAdapter( {interface:'serial', port:'COM5', protocol:'Daum Premium'})            
            device.startUpdatePull = jest.fn()

            bike = device.bike
            device.stop = jest.fn( ()=>Promise.resolve(true) )
            bike.getDeviceType = jest.fn(()=>Promise.resolve('bike'))
            bike.getProtocolVersion = jest.fn(()=>Promise.resolve('123'))
            bike.programUpload = jest.fn( ()=>Promise.resolve(true))
            bike.startProgram = jest.fn( ()=>Promise.resolve(true))
            bike.setPerson = jest.fn( ()=>Promise.resolve(true))
            bike.setGear = jest.fn( ()=>Promise.resolve(10))
        })

        const run = async(props?,isRelaunch?) => {
            let started:boolean = false;
            let error:Error|undefined = undefined

            try {
                started = await device.launch(props,isRelaunch)
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
                
                device.bike.close().catch()
                jest.useRealTimers()
            })

            test('initial Launch with user and bike settings ',async ()=>{
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

            test('initial Launch with user and bike settings ',async ()=>{
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

        describe('Daum Classic Mode - EPP supported', ()=>{
            beforeEach( ()=>{
                device.cyclingMode = new CyclingModeBase(device)
                device.cyclingMode.getModeProperty=jest.fn().mockReturnValue(true)
                device.cyclingMode.setSettings=jest.fn()
                device.cyclingMode.getSetting=jest.fn((key)=>key==='bikeType'? 'race' : undefined)
                device.cyclingMode.getName=jest.fn().mockReturnValue('Mock')

                bike.programUpload = jest.fn()
                bike.startProgram = jest.fn()
            })

            afterEach( ()=>{
                
                device.bike.close().catch()
                jest.useRealTimers()
            })

            test('initial Launch without properties',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                const {started,error} = await run( )
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).not.toHaveBeenCalled()
                expect(device.startUpdatePull).toBeCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).toHaveBeenCalled()
                expect(bike.startProgram).toHaveBeenCalled()
            })

            test('initial Launch with user and bike settings ',async ()=>{                
                bike.programUpload.mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, false)
                expect(started).toBeTruthy()                
                expect(error).toBeUndefined()

                expect(device.stop).not.toHaveBeenCalled()
                expect(device.startUpdatePull).toBeCalled();
                expect(device.stopped).toBeFalsy()
                expect(device.paused).toBeFalsy()
                expect(bike.programUpload).toHaveBeenCalled()
                expect(bike.startProgram).toHaveBeenCalled()
            })

            test('Epp upload commands fails permanently  ',async ()=>{

                device._startRetryTimeout = 50;
                bike.programUpload.mockResolvedValue(false)
                
                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, true)


                expect(started).toBeFalsy()
                expect(error).toBeDefined()
                expect(device.startUpdatePull).not.toBeCalled();
            })

            test('Epp start commands fails permanently  ',async ()=>{

                device._startRetryTimeout = 50;
                bike.startProgram.mockResolvedValue(false)
                
                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, true)


                expect(started).toBeFalsy()
                expect(error).toBeDefined()
                expect(device.startUpdatePull).not.toBeCalled();
            })

            test('one of the init commands fails temporarily  ',async ()=>{
                bike.programUpload.mockResolvedValueOnce(false).mockResolvedValue(true)
                bike.startProgram.mockResolvedValue(true)

                device._startRetryTimeout = 50;
                const {started,error} = await run( {user: {weight:100}, bikeSettings:{weight:15}}, true)

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

            bike = device.bike
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

            await device.getCurrentBikeData() 
            expect(bike.connect).toHaveBeenCalled();
            expect(bike.getTrainingData).not.toHaveBeenCalled();

        })

    })

})