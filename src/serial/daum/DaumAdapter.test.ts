import { EventLogger } from 'gd-eventlog';
import DaumAdapter from './DaumAdapter';
import ICyclingMode from '../../modes/types';
import { MockLogger } from '../../../test/logger';
import { DeviceProperties, IncyclistBikeData } from '../../types';
import { resolveNextTick, sleep } from '../../utils/utils';
import { DaumSerialComms} from './types';
import DaumClassicCyclingMode from '../../modes/daum-classic-standard';
import { SerialDeviceSettings } from '../types';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

const DEFAULT_SETTINGS = { interface:'serial', protocol: 'any'}



describe( 'DaumAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
        jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( MockLogger)
        jest.useRealTimers();
    })

    describe('constructor' ,()=>{
        test('status',()=>{
            const a = new DaumAdapter(DEFAULT_SETTINGS)
            expect(a.comms).toBeUndefined()
            expect(a.stopped).toBe(false)
            expect(a.getCyclingMode()).toBeDefined();
            expect(a.deviceData).toEqual({isPedalling:false,
                time:0,
                power:0,
                pedalRpm:0,
                speed:0,
                distanceInternal:0,
                heartrate:0})

        })
        test('with properties',()=>{
            const properties:DeviceProperties = { userWeight:80, bikeWeight:14 }
            const a = new DaumAdapter(DEFAULT_SETTINGS, properties)
            expect(a.getCyclingMode()).toBeDefined();
            expect((a as any).props).toMatchObject(properties)
                  
        })
        test('partial props',()=>{
            const properties:DeviceProperties = { bikeWeight:14 }
            const a = new DaumAdapter(DEFAULT_SETTINGS, properties)
            expect((a as any).props).toMatchObject(properties)
            expect(a.getUser()).toEqual({})
        })
    })
   

    describe('sendInitCommands',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>  
        beforeEach( ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.started = true
            a.paused = false
            a.stopped = false
            a.sendUpdate = jest.fn().mockResolvedValue(true)
            // default cycling Mode is ERG 
        })

        test('normal',async ()=>{
            const res = await a.sendInitCommands()
            expect(res).toBeTruthy()
        })

        test('not started',async ()=>{
            a.started = false
            const res = await a.sendInitCommands()
            expect(res).toBe(false)
            expect(a.sendUpdate).not.toHaveBeenCalled()
        })

        test('paused',async ()=>{
            a.paused = true
            const res = await a.sendInitCommands()
            expect(a.sendUpdate).toHaveBeenCalled()
            expect(res).toBeTruthy()

        })

        test('stopped',async ()=>{
            a.stopped = true
            const res = await a.sendInitCommands()
            expect(res).toBe(false)
            expect(a.sendUpdate).not.toHaveBeenCalled()
        })

        test('ERG Mode, power already set',async ()=>{
            a.deviceData.power = 123
            a.getData().power = 123
            a.getCyclingMode().getBikeInitRequest = jest.fn().mockReturnValue({targetPower:555})

            const res = await a.sendInitCommands()
            expect(res).toBeTruthy()
            expect(a.sendUpdate).toHaveBeenCalledWith({targetPower:123})

        })

        test('ERG Mode, power not yet set',async ()=>{
            a.deviceData.power = 0
            a.getData().power = undefined
            a.getCyclingMode().getBikeInitRequest = jest.fn().mockReturnValue({targetPower:555})

            const res = await a.sendInitCommands()
            expect(res).toBeTruthy()
            expect(a.sendUpdate).toHaveBeenCalledWith({targetPower:555})

        })

        test('Other Mode',async ()=>{
            const cm = new DaumClassicCyclingMode(a,{})
            a.getCyclingMode = jest.fn().mockReturnValue(cm)
            const res = await a.sendInitCommands()
            expect(res).toBe(false)
            expect(a.sendUpdate).not.toHaveBeenCalled()
        })

        test('send Update throws error',async ()=>{
            a.sendUpdate = jest.fn().mockRejectedValue(new Error('XXX'))
            const res = await a.sendInitCommands()
            expect(res).toBe(false)
            expect(a.sendUpdate).toHaveBeenCalled()

        })

    })

    test('getDefaultCyclingMode',()=>{
        const a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        expect(a.getDefaultCyclingMode().getName()).toBe('ERG')
    })

    test('getCurrentBikeData: need to be implemnted in subclass',()=>{
        const a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});

        expect( ()=>{a.getCurrentBikeData()}).toThrow('Method not implemented.')
    })

    test('start: need to be implemnted in subclass',()=>{
        const a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        expect( ()=>{a.getCurrentBikeData()}).toThrow('Method not implemented.')
    })


    describe('updateData unit test',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>  
        let cm: ICyclingMode = {
            getName: () => '',
            getDescription: () => '',
            buildUpdate: jest.fn(),
            confirmed: jest.fn(),   
            updateData: jest.fn(),
            getProperties: jest.fn(),
            getProperty: jest.fn(),
            setSetting: jest.fn(),
            getBikeInitRequest: jest.fn(),
            setSettings: jest.fn(),
            getSetting: jest.fn(),
            getSettings: jest.fn(),
            setModeProperty: jest.fn(),
            getModeProperty: jest.fn(),
            getData:jest.fn()
        }
    
        beforeEach( ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.setCyclingMode( cm)
        })

        test('returns values delivered by cm.updateData()',()=>{
            const cmData = {gear:10, power:100, speed:30, isPedalling:false,pedalRpm:0,heartrate:0,distance:0,distanceInternal:0  }
            cm.updateData = jest.fn( (data)=>cmData);

            a.updateData({pedalRpm:0, power:25, speed:0, heartrate:0, isPedalling:false,distanceInternal:0, time:0})
            expect(a.deviceData).toEqual(cmData)
        })

    })

    describe('isSame',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.getName = jest.fn().mockReturnValue('Test1')
            a.getPort = jest.fn().mockReturnValue('Port1')
        })

        test('not a DaumAdapter',()=> {
            class C {}
            const b = new C()

            const res = a.isSame(b)
            expect(res).toBe(false)
        })
        test('is the same',()=> {            
            const b = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:180, bikeWeight:55});
            b.getName = jest.fn().mockReturnValue('Test1')
            b.getPort = jest.fn().mockReturnValue('Port1')

            const res = a.isSame(b)
            expect(res).toBe(true)

        })
        test('different name',()=> {
            const b = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:180, bikeWeight:55});
            b.getName = jest.fn().mockReturnValue('Test2')
            b.getPort = jest.fn().mockReturnValue('Port1')

            const res = a.isSame(b)
            expect(res).toBe(false)

        })
        test('different port',()=> {
            const b = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:180, bikeWeight:55});
            b.getName = jest.fn().mockReturnValue('Test1')
            b.getPort = jest.fn().mockReturnValue('Port2')

            const res = a.isSame(b)
            expect(res).toBe(false)

            b.getPort = jest.fn().mockReturnValue(undefined)
            expect(res).toBe(false)


        })

    })

    describe('check',()=>{

        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.getPort = jest.fn().mockReturnValue('COM1')
            a.logEvent = jest.fn()
            jest.useRealTimers()
        })

        test('concurrent requests',async ()=>{
            a.performCheck = jest.fn( async () => {await sleep(200); return true  })

            const promise1 = a.check()
            await sleep(50)
            const promise2 = a.check()
            const res = await Promise.allSettled([promise1,promise2])

            expect(res[0]).toEqual( {status:'fulfilled', value:true})
            expect(res[1]).toEqual( {status:'fulfilled', value:true})
            expect(a.checkPromise).toBeUndefined()

            expect(a.logEvent).toHaveBeenNthCalledWith( 1,expect.objectContaining({message:'waiting for previous check device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 2,expect.objectContaining({message:'previous check device completed'}))
        })

        test('concurrent requests throwing error',async ()=>{
            a.performCheck = jest.fn( async () => {await sleep(200); throw new Error('not connected')  })

            const promise1 = a.check()
            await sleep(50)
            const promise2 = a.check()
            const res = await Promise.allSettled([promise1,promise2])

            expect(res[0]).toMatchObject( {status:'rejected'})
            expect(res[1]).toMatchObject( {status:'rejected'})
            expect(a.checkPromise).toBeUndefined()

            expect(a.logEvent).toHaveBeenNthCalledWith( 1,expect.objectContaining({message:'waiting for previous check device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 2,expect.objectContaining({message:'previous check device completed'}))
        })

        // TODO: review use of this check
        test('device is stopped',async ()=>{
            a.isStopped = jest.fn().mockReturnValue(true)

            a.performCheck = jest.fn( )
            const res = await a.check()
            expect(res).toBe(false)
            expect(a.performCheck).not.toHaveBeenCalled()
            expect(a.checkPromise).toBeUndefined()
        })

        test('check successfull',async ()=>{
            a.performCheck = jest.fn( ).mockResolvedValue(true)
            const res = await a.check()
            expect(res).toBe(true)
            expect(a.performCheck).toHaveBeenCalled()
            expect(a.checkPromise).toBeUndefined()
            
        })

        test('check throws error',async ()=>{
            a.performCheck = jest.fn( ).mockRejectedValue( new Error('not connected'))
            await expect( async ()=> { await a.check()}).rejects.toThrow('not connected')
            expect(a.performCheck).toHaveBeenCalled()
            
        })

        test('check while start is busy',async ()=>{
            a.performStart = jest.fn( async () => {await sleep(200); return true  })
            a.performCheck = jest.fn( async () => {await sleep(200); return true  })
            a.getDeviceInfo = jest.fn().mockResolvedValue({})
            a.logger = { logEvent:jest.fn() }
            a.logEvent = a.logger.logEvent

            const promise1 = a.start()
            await sleep(50)
            const promise2 = a.check()
            const res = await Promise.allSettled([promise1,promise2])

            expect(res[0]).toEqual( {status:'fulfilled', value:true})
            expect(res[1]).toEqual( {status:'fulfilled', value:true})
            expect(a.startPromise).toBeUndefined()

            expect(a.logger.logEvent).toHaveBeenNthCalledWith( 1,expect.objectContaining({message:'initial start of device'}))
            expect(a.logger.logEvent).toHaveBeenNthCalledWith( 2,expect.objectContaining({message:'waiting for previous device launch'}))
            expect(a.logger.logEvent).toHaveBeenNthCalledWith( 3,expect.objectContaining({message:'device info'}))
            expect(a.logger.logEvent).toHaveBeenNthCalledWith( 4,expect.objectContaining({message:'start result: success'}))
            expect(a.logger.logEvent).toHaveBeenNthCalledWith( 5,expect.objectContaining({message:'previous device launch attempt completed'}))

        })

    })

    describe('start',()=>{

        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.getPort = jest.fn().mockReturnValue('COM1')
            a.getDeviceInfo = jest.fn().mockResolvedValue({})
            a.logEvent = jest.fn()
            jest.useRealTimers()
        })

        test('concurrent requests',async ()=>{
            a.logger = { logEvent:jest.fn() }
            a.logEvent = a.logger.logEvent

            a.performStart = jest.fn( async () => {await sleep(200); return true  })

            const promise1 = a.start()
            await sleep(50)
            const promise2 = a.start()
            const res = await Promise.allSettled([promise1,promise2])

            expect(res[0]).toEqual( {status:'fulfilled', value:true})
            expect(res[1]).toEqual( {status:'fulfilled', value:true})
            expect(a.startPromise).toBeUndefined()

            expect(a.logEvent).toHaveBeenNthCalledWith( 1,expect.objectContaining({message:'initial start of device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 2,expect.objectContaining({message:'waiting for previous device launch'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 3,expect.objectContaining({message:'device info'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 4,expect.objectContaining({message:'start result: success'}))

            expect(a.logEvent).toHaveBeenNthCalledWith( 5,expect.objectContaining({message:'previous device launch attempt completed'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 6,expect.objectContaining({message:'relaunch of device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 7,expect.objectContaining({message:'start result: success'}))

        })

        test('start while check is busy',async ()=>{
            a.logger = { logEvent:jest.fn() }
            a.logEvent = a.logger.logEvent

            a.performStart = jest.fn( async () => {await sleep(200); return true  })
            a.performCheck = jest.fn( async () => {await sleep(200); return true  })

            const promise1 = a.check()
            await sleep(50)
            const promise2 = a.start()
            const res = await Promise.allSettled([promise1,promise2])

            expect(res[0]).toEqual( {status:'fulfilled', value:true})
            expect(res[1]).toEqual( {status:'fulfilled', value:true})
            expect(a.startPromise).toBeUndefined()

            expect(a.logEvent).toHaveBeenNthCalledWith( 1,expect.objectContaining({message:'waiting for previous check device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 2,expect.objectContaining({message:'previous check device completed'}))

            expect(a.logEvent).toHaveBeenNthCalledWith( 3,expect.objectContaining({message:'initial start of device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 4,expect.objectContaining({message:'device info'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 5,expect.objectContaining({message:'start result: success'}))
        })

        test('concurrent requests throwing error',async ()=>{
            a.logger = { logEvent:jest.fn() }
            a.logEvent = a.logger.logEvent

            a.performStart = jest.fn( async () => {await sleep(200); throw new Error('not connected')  })

            const promise1 = a.start()
            await sleep(50)
            const promise2 = a.start()
            const res = await Promise.allSettled([promise1,promise2])

            expect(res[0]).toMatchObject( {status:'rejected'})
            expect(res[1]).toMatchObject( {status:'rejected'})
            expect(a.checkPromise).toBeUndefined()

            expect(a.logEvent).toHaveBeenNthCalledWith( 1,expect.objectContaining({message:'initial start of device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 2,expect.objectContaining({message:'waiting for previous device launch'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 3,expect.objectContaining({message:'start result: error'}))

            expect(a.logEvent).toHaveBeenNthCalledWith( 4,expect.objectContaining({message:'previous device launch attempt completed'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 5,expect.objectContaining({message:'initial start of device'}))
            expect(a.logEvent).toHaveBeenNthCalledWith( 6,expect.objectContaining({message:'start result: error'}))
        })

        test('device not yet started',async ()=>{
            a.started = false
            a.performStart = jest.fn().mockResolvedValue(true)

            const res = await a.start()
            expect(res).toBe(true)
            expect(a.performStart).toHaveBeenCalledWith(undefined,false,false)
            expect(a.getDeviceInfo).toHaveBeenCalled()
            expect(a.startPromise).toBeUndefined()
        })

        test('device is already started and paused',async ()=>{
            a.started = true
            a.paused = true
            a.performStart = jest.fn().mockResolvedValue(true)

            const res = await a.start()
            expect(res).toBe(true)
            expect(a.started).toBe(true)
            expect(a.performStart).toHaveBeenCalledWith(undefined,true,true)
            expect(a.getDeviceInfo).not.toHaveBeenCalled()
            expect(a.startPromise).toBeUndefined()
        })
        test('device is already started and not paused',async ()=>{
            a.started = true
            a.performStart = jest.fn().mockResolvedValue(true)

            const res = await a.start()
            expect(res).toBe(true)
            expect(a.started).toBe(true)
            expect(a.performStart).toHaveBeenCalledWith(undefined,true,false)
            expect(a.getDeviceInfo).not.toHaveBeenCalled()
            expect(a.startPromise).toBeUndefined()
        })


        test('start throws error',async ()=>{
            a.performStart = jest.fn( ).mockRejectedValue( new Error('not connected'))
            await expect( async ()=> { await a.start()}).rejects.toThrow('not connected')
            expect(a.started).toBe(false)
            expect(a.performStart).toHaveBeenCalled()
            expect(a.startPromise).toBeUndefined()
            
        })

        test('start returns false',async ()=>{
            a.performStart = jest.fn( ).mockResolvedValue(false)
            const res = await a.start()
            expect(res).toBe(false)
            expect(a.started).toBe(false)
            expect(a.performStart).toHaveBeenCalled()
            expect(a.startPromise).toBeUndefined()
            
        })


    })

    describe('startUpdatePull',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.bikeSync = jest.fn()
            a.emitData = jest.fn()
            a.refreshRequests = jest.fn()
            a.logEvent = jest.fn()
            //a.getPort = jest.fn().mockReturnValue('COM1')
            jest.useRealTimers()
        })

        afterEach( ()=>{
            if (a.iv?.sync)
                clearInterval(a.iv.sync)
            if (a.iv?.update)
                clearInterval(a.iv.update)
        })

        test('not yet started',()=>{
            a.startUpdatePull()
            expect(a.iv).toBeDefined()
            expect(a.iv.sync).toBeDefined()
            expect(a.iv.update).toBeDefined()
            expect(a.logEvent).toHaveBeenCalledWith( expect.objectContaining({message:'start update pull'}))
        })

        test('already started',async ()=>{
            const iv =  {
                sync: setInterval( ()=>{}, 100),
                update: setInterval( ()=>{}, 100)
            }
            a.pullFrequency = 10

            a.iv = iv
            a.startUpdatePull()
            expect(a.iv).toBe(iv)
            expect(a.logEvent).not.toHaveBeenCalled()

            await sleep(30)
            expect(a.bikeSync).not.toHaveBeenCalled()
            
        })
    })

    describe('stopUpdatePull',()=>{
        let a:any
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            //a.bikeSync = jest.fn()
            a.emitData = jest.fn()
            a.refreshRequests = jest.fn()
            a.logEvent = jest.fn()
            a.sendRequests = jest.fn().mockResolvedValue(true)
            a.update = jest.fn().mockResolvedValue(true)
            jest.useRealTimers()
        })

        afterEach( ()=>{
            if (a.iv?.sync)
                clearInterval(a.iv.sync)
            if (a.iv?.update)
                clearInterval(a.iv.update)
        })

        test('not yet started',()=>{
            a.stopUpdatePull()
            expect(a.iv).toBeUndefined()
            expect(a.logEvent).not.toHaveBeenCalled()
        })

        test('already started',async ()=>{
            await a.startUpdatePull()
            await a.stopUpdatePull()
            expect(a.iv).toBeUndefined()
            expect(a.logEvent).toHaveBeenCalledWith( expect.objectContaining({message:'stop update pull'}))
            
        })
    })


    describe('connect',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        })

        afterEach( ()=>{
        })

        test('no bike',async ()=>{
            a.comms = undefined
            const res = await a.connect()
            expect(res).toBe(false)
        })

        test('already connected',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(true)}
            const res = await a.connect()
            expect(res).toBe(true)
            
        })

        test('not yet connected',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(false), connect:jest.fn().mockResolvedValue(true)}
            const res = await a.connect()
            expect(res).toBe(true)            
        })

        test('not yet connected, connection fails',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(false), connect:jest.fn().mockResolvedValue(false), close:jest.fn()}
            const res = await a.connect()
            expect(a.comms.close).not.toHaveBeenCalled()
            expect(res).toBe(false)            
        })

        test('not yet connected, connection throws error',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(false), connect:jest.fn().mockRejectedValue(new Error('XXX')), close:jest.fn()}
            const res = await a.connect()
            expect(res).toBe(false)            
            expect(a.comms.close).toHaveBeenCalled()
        })

    })

    describe('close',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        })

        test('no bike',async ()=>{
            a.comms = undefined
            const res = await a.close()
            expect(res).toBe(true)
        })

        test('already connected, bike closes OK',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(true), close:jest.fn().mockResolvedValue(true)}
            const res = await a.close()
            expect(res).toBe(true)
            
        })
        test('already connected, bike close fails',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(true), close:jest.fn().mockResolvedValue(false)}
            const res = await a.close()
            expect(res).toBe(false)
            
        })

        test('not yet connected',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(false), close:jest.fn().mockResolvedValue(true)}
            const res = await a.close()
            expect(res).toBe(true)
            expect(a.comms.close).not.toHaveBeenCalled()            
        })


    })

    describe('verifyConnection',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        })

        afterEach( ()=>{
        })

        test('no bike',async ()=>{
            a.comms = undefined
            await expect( async () => {await a.verifyConnection()}).rejects.toThrow()
            
        })

        test('already connected',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(true), connect:jest.fn()}
            await a.verifyConnection()
            expect(a.comms.connect).not.toHaveBeenCalled()
            
        })

        test('not yet connected',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(false), connect:jest.fn().mockResolvedValue(true)}
            await a.verifyConnection()
            expect(a.comms.connect).toHaveBeenCalled()
             
        })

        test('not yet connected, connection fails',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(false), connect:jest.fn().mockResolvedValue(false)}
            await expect( async () => {await a.verifyConnection()}).rejects.toThrow()
        })


    })

    describe('reconnect',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        })

        afterEach( ()=>{
        })

        test('no bike',async ()=>{
            a.comms = undefined
            const res = await a.reconnect()
            expect(res).toBe(false)
        })

        test('already connected',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(true),close:jest.fn().mockResolvedValue(true), connect:jest.fn().mockResolvedValue(true),getPort:jest.fn().mockReturnValue('COM1')}
            const res = await a.reconnect()
            expect(res).toBe(true)
            expect(a.comms.close).toHaveBeenCalled()
            expect(a.comms.connect).toHaveBeenCalled()
            
        })

        test('not yet connected',async ()=>{
            a.comms = { isConnected:jest.fn().mockReturnValue(false),close:jest.fn().mockResolvedValue(true), connect:jest.fn().mockResolvedValue(true),getPort:jest.fn().mockReturnValue('COM1')}
            const res = await a.reconnect()
            expect(res).toBe(true)
            expect(a.comms.close).toHaveBeenCalled()
            expect(a.comms.connect).toHaveBeenCalled()
        })

        test('close throws error',async ()=>{
            a.comms = { close:jest.fn().mockRejectedValue( new Error('XXX')), connect:jest.fn().mockResolvedValue(true),getPort:jest.fn().mockReturnValue('COM1')}
            const res = await a.reconnect()
            expect(res).toBe(false)            
        })

        test('connect throws error',async ()=>{
            a.comms = { close:jest.fn().mockResolvedValue(true), connect:jest.fn().mockRejectedValue( new Error('XXX')),getPort:jest.fn().mockReturnValue('COM1')}
            const res = await a.reconnect()
            expect(res).toBe(false)            
        })

    })

    describe('stop',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.logEvent = jest.fn()
            a.resume = jest.fn()
            a.stopUpdatePull = jest.fn()
            a.comms = {
                close:jest.fn().mockResolvedValue(true),
                getPort:jest.fn().mockReturnValue('COM1')
            }
        })

        afterEach( ()=>{
        })

        test('already stopped',async ()=>{
            a.stopped = true
            const res = await a.stop()
            expect(res).toBe(true)
            expect(a.logEvent).not.toHaveBeenCalled()
            expect(a.comms.close).not.toHaveBeenCalled()
        })

        test('paused',async ()=>{
            a.paused = true
            const res = await a.stop()
            expect(res).toBe(true)

            expect(a.logEvent).toHaveBeenCalled()
            expect(a.resume).toHaveBeenCalled()
            expect(a.comms.close).toHaveBeenCalled()
            expect(a.stopUpdatePull).toHaveBeenCalled()
            expect(a.stopped).toBe(true)
            
        })


        test('close throws error',async ()=>{
            a.comms = { close:jest.fn().mockRejectedValue( new Error('XXX')),getPort:jest.fn().mockReturnValue('COM1')}

            await expect( async () => {await a.stop()}).rejects.toThrow()

            expect(a.comms.close).toHaveBeenCalled()
            expect(a.stopUpdatePull).toHaveBeenCalled()
            expect(a.stopped).toBe(false)

            expect(a.logEvent).toHaveBeenCalledWith( expect.objectContaining({message:'stop request failed'}))
        })

    })

    describe('canSendUpdate ',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        })


        test('stopped',()=>{
            a.stopped = true
            const res = a.canEmitData()
            expect(res).toBe(false)
        })

        test('paused',async ()=>{
            a.paused = true
            const res = a.canEmitData()
            expect(res).toBe(false)            
        })


        test('always emit',async ()=>{            
            a.getMaxUpdateFrequency=jest.fn().mockReturnValue(-1)
            const res = a.canEmitData()
            expect(res).toBe(true)            
        })

        test('previous emit above threshold',async ()=>{            
            a.getMaxUpdateFrequency=jest.fn().mockReturnValue(1000)
            a.lastUpdate = Date.now()-1001
            const res = a.canEmitData()
            expect(res).toBe(true)            
        })

    })

    describe('update ',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.emitData = jest.fn()
            a.getCurrentBikeData = jest.fn()
            a.canSendUpdate = jest.fn().mockReturnValue(true)
            jest.useRealTimers()

        })

        test('normal',async ()=>{            
            a.getCurrentBikeData.mockResolvedValue({power:100, speed:10, pedalRpm:90})
            a.getCyclingMode().updateData = jest.fn( (data) => data)

            a.update()
            await resolveNextTick()
            expect(a.emitData).toHaveBeenCalledWith( expect.objectContaining({power:100,speed:10, cadence:90}))  
            expect(a.updateBusy).toBe(false)
        })

        test('cannot emit update',async ()=>{
            a.canEmitData = jest.fn().mockReturnValue(false)
            a.update()
            await resolveNextTick()

            expect(a.emitData).not.toHaveBeenCalled()
            expect(a.getCurrentBikeData).not.toHaveBeenCalled()
            expect(a.updateBusy).toBe(false)
        })

        test('update busy',async ()=>{
            a.updateBusy = true
            a.update()
            await resolveNextTick()
            expect(a.emitData).not.toHaveBeenCalled()
            expect(a.getCurrentBikeData).not.toHaveBeenCalled()            
        })

        test('getCurrentBikeData error',async ()=>{            
            a.getCurrentBikeData.mockRejectedValue(new Error('not connected'))
            a.deviceData = {power:99,pedalRpm:78,speed:25}

            a.updateData = jest.fn()
            a.transformData = jest.fn()

            jest.useRealTimers()
            a.update()
            await resolveNextTick()

            expect(a.updateData).toHaveBeenCalledWith(a.deviceData)  
            expect(a.emitData).not.toHaveBeenCalled()  
            expect(a.updateBusy).toBe(false)
        })



    })



    describe('sendRequests ',()=>{
        let a
        beforeEach( ()=>{
            a = new DaumAdapter(DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.sendRequest = jest.fn()
            a.requests = []
            a.logEvent = jest.fn()
            jest.useRealTimers()
        })

        test('single request',async ()=>{            
            a.requests = [ {targetPower:100}]
            a.sendRequest = jest.fn( r => r)

            await a.sendRequests()
            expect(a.sendRequest).toHaveBeenCalledWith({targetPower:100})  
            expect(a.requests.length).toBe(0)
        })
        test('multiple request',async ()=>{            
            a.requests = [ {targetPower:100}, {targetSlope:1}, {targetPower:99}]
            a.sendRequest = jest.fn( r => r)

            await a.sendRequests()
            expect(a.sendRequest).toHaveBeenCalledWith({targetPower:99})  
            expect(a.sendRequest).toHaveBeenCalledTimes(1)  
            expect(a.requests.length).toBe(0)

            expect(a.logEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({message:'ignoring bike update request'}))
            expect(a.logEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({message:'ignoring bike update request'}))
            expect(a.logEvent).toHaveBeenCalledTimes(2) 

        })

        test('no request',async ()=>{            
            a.requests = []
            a.sendRequest = jest.fn( r => r)

            await a.sendRequests()
            expect(a.sendRequest).not.toHaveBeenCalled()
            expect(a.requests.length).toBe(0)
        })

        test('single request - additional request while sending',async ()=>{            
            a.requests = [ {targetPower:100}]
            a.sendRequest = jest.fn( async r =>  { await sleep(200); return r})


            const promise =  a.sendRequests()
            await sleep(10)
            a.requests.push( {reset:true})
            await promise;

            expect(a.sendRequest).toHaveBeenCalledWith({targetPower:100})  
            expect(a.requests.length).toBe(1)
        })


        test('request busy',async ()=>{
            a.requestBusy = true
            const requests = [ {targetPower:100}, {targetSlope:1}, {targetPower:99}]
            a.requests = requests
            a.sendRequest = jest.fn( r => r)

            await a.sendRequests()
            expect(a.requests).toBe(requests)            

        })

        test('stopped',async ()=>{
            a.stopped = true
            const requests = [ {targetPower:100}, {targetSlope:1}, {targetPower:99}]
            a.requests = requests
            a.sendRequest = jest.fn( r => r)

            await a.sendRequests()
            expect(a.requests).toBe(requests)            
        })
        test('paused',async ()=>{
            a.paused = true
            const requests = [ {targetPower:100}, {targetSlope:1}, {targetPower:99}]
            a.requests = requests
            a.sendRequest = jest.fn( r => r)

            await a.sendRequests()
            expect(a.requests).toBe(requests)            
        })

        test('sendRequest error',async ()=>{            
            a.requests = [ {targetPower:100}, {targetSlope:1}, {targetPower:99}]
            a.sendRequest = jest.fn().mockRejectedValue(new Error('not connected'))

            await a.sendRequests()
            expect(a.sendRequest).toHaveBeenCalled()  
            expect(a.requests.length).toBe(1)
            expect(a.logEvent).toHaveBeenCalledWith( expect.objectContaining({message:'bike update error'}))
        })



    })

    describe('updateData component test',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>  
        let data:any;

        beforeAll( () => {
            jest.useFakeTimers();
        })
        afterAll( () => {
            jest.useRealTimers();
        })
    
        beforeEach( async ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            
            data={}
            await a.updateData({pedalRpm:0,power:0,speed:0,slope:0,gear:10,isPedalling:false});
        })

        test('start - no pedalling',()=>{
            let data = {}
            jest.advanceTimersByTime(1000);
            data = a.updateData({pedalRpm:0, power:50, speed:0, heartrate:0, time:0, gear:10, isPedalling:false})
            expect(data).toEqual({isPedalling:false, power:0, pedalRpm:0, speed:0, heartrate:0, distanceInternal:0, time:0,gear:10, slope:0})
            
        })

        test('start - pedalling',()=>{
            let data;

            jest.advanceTimersByTime(1000);            
            data=a.updateData({pedalRpm:90, power:50, speed:29.9, heartrate:0, isPedalling:true, time:0, gear:10})
            expect(data).toMatchObject({isPedalling:true, power:50, pedalRpm:90,  heartrate:0, time:1,gear:10, slope:0})
            expect(data.distanceInternal).toBeCloseTo(1,0)
            expect(data.speed).toBeCloseTo(3.8,1)
        })

        test('increase slope: power does not change, speed gets slower',()=>{
            let data;            

            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:0, speed:29.9, heartrate:0, time:0, gear:10})
            expect(data).toMatchObject({isPedalling:true, power:50, pedalRpm:90, heartrate:0,   time:1,gear:10, slope:0})
            expect(data.distanceInternal).toBeCloseTo(1,0)
            expect(data.speed).toBeCloseTo(3.8,1)

            a.sendUpdate({slope:1})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:1, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(5.0,1)
            
            a.sendUpdate({slope:2})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:2, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(5.6,1)
        })

        test('slope negative: power does not change, speed increases',()=>{
            let data;
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:0, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data).toMatchObject({isPedalling:true, power:50, pedalRpm:90, heartrate:0, time:1,gear:10, slope:0})
            expect(data.distanceInternal).toBeCloseTo(1,0)
            expect(data.speed).toBeCloseTo(3.8,1)
            
            a.sendUpdate({slope:-1})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:0, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.speed).toBeCloseTo(5.5,1)
            expect(data.power).toEqual(50)

            a.sendUpdate({slope:-2})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:-1, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.speed).toBeCloseTo(7.1,1)
            expect(data.power).toEqual(50)

        })




    })

  
    describe('sendUpdate',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>  
        let data:IncyclistBikeData;
    
        beforeEach( async ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.sendRequest = jest.fn( (request)=>Promise.resolve(request))
            data={pedalRpm:90,slope:0,gear:10, power:100,speed:30}
            await a.updateData(data);
        })

        test('reset: will only reset internal values, no updates are sent to bike',async ()=>{
            const res = await a.sendUpdate({reset:true}) as any;
            expect(res).toEqual({reset:true})
        })

        test('empty object: same as reset',async ()=>{
            const res = await a.sendUpdate({})
            expect(res).toEqual({})
        })

        test('no data yet:',async ()=>{
            const b = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            const res = await b.sendUpdate({})
            
            expect(res).toEqual({})
        })


        test('refresh, on first request: just calculates target Power',async ()=>{

            const res = await a.sendUpdate({refresh:true}) as any;
            expect(res.targetPower).toBeCloseTo(147,0)
            expect(res.slope).toBeUndefined()
        })
        test('refresh,on subsequent request, ERG will not repeat same request',async ()=>{
            await a.sendUpdate({slope:10, targetPower:100});
            const res = await a.sendUpdate({refresh:true}) as any;
            expect(res).toEqual({})
            
        })

        test('slope: sets target Power',async ()=>{
           
            await a.sendUpdate({reset:true})
            const res = await a.sendUpdate({slope:5}) as any;
            expect(res.slope).toBeUndefined()
            expect(res.targetPower).toBeCloseTo(147,0)      
        })

        test('slope: slope value has no impact',async ()=>{
            let res;
            
            res= await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(147,0)      
            res = await a.sendUpdate({slope:2})
            expect(res.targetPower).toBeCloseTo(147,0)      
            res = await a.sendUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(147,0)      

            await a.updateData({pedalRpm:90,slope:0,gear:20, power:100, speed:30});            
            res = await a.sendUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(350,0)      

        })

        test('rpm changes will enforce recalculation',async ()=>{
            let res;
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(147,0)      

            
            await a.updateData(Object.assign({},a.deviceData,{pedalRpm:91,gear:10}));
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(152,0)      

            await a.updateData(Object.assign({},a.deviceData,{pedalRpm:90,gear:10}));
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(147,0)      

            res = await a.sendUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(147,0)      

        })

        test('targetPower set',async ()=>{
            let res;
            res = await a.sendUpdate({targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({slope:22, targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({minPower:22, targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
        })
        test('minPower=maxPower',async ()=>{
            let res;
            res = await a.sendUpdate({minPower:200,maxPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({slope:22, minPower:200,maxPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({minPower:22, maxPower:22})
            expect(res.targetPower).toBeCloseTo(22,0)      
        })

        
        test('maxPower set, but current power below limit: ',async ()=>{
            //await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});                       
            let res = await a.sendUpdate({maxPower:200}) as any
            expect(res.targetPower).toBeCloseTo(147,0)      
 
        })
        test('maxPower set, current power above limit: enforces limit',async ()=>{          
            await a.updateData(Object.assign({},a.deviceData,{pedalRpm:90,gear:20}));            
            const res =await a.sendUpdate({  maxPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })
        test('maxPower and targetPower set, targetPower>maxPower : maxPower overrules',async ()=>{          
            const res =await a.sendUpdate({maxPower:120, targetPower:200}) as any;
            expect(res.targetPower).toEqual(120)
 
        })
        test('maxPower and targetPower set, targetPower<maxPower : targetPower overrules',async ()=>{          
            const res =await a.sendUpdate({maxPower:220, targetPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })

        test('maxPower after slope update: maxPower is reflected',async ()=>{         
            data.slope=1.5
            await a.updateData(Object.assign({},a.deviceData,{pedalRpm:90,gear:10}));   
            const res =await a.sendUpdate({maxPower:120 }) as any;
            expect(res.targetPower).toBeCloseTo(120,0)
 
        })

        test('minPower set, but current power above limit: ',async ()=>{
            //await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});                       
            let res = await a.sendUpdate({minPower:90}) as any
            expect(res.targetPower).toBeCloseTo(147,0)      
 
        })
        test('min set, current power below limit: enforces limit',async ()=>{          
            await a.updateData(Object.assign({},a.deviceData,{peadlRpm:10, gear:5}));       // -> 2.5W     
            const res =await a.sendUpdate({minPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })
        test('minPower and targetPower set: targetPower overrules',async ()=>{          
            const res =await a.sendUpdate({maxPower:210, targetPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })

        test('minPower after slope update: minPower is reflected',async ()=>{         
            data.slope=-1.5
            await a.updateData(Object.assign({},a.deviceData,{pedalRpm:90,gear:10}));   
            const res =await a.sendUpdate({minPower:180 }) as any;
            expect(res.targetPower).toBeCloseTo(180,0)
 
        })

        test('paused',async ()=>{
            a.paused = true;
            const res = await a.sendUpdate({})
            expect(res).toBeUndefined()
        })

        test('stopped',async ()=>{
            a.stopped = true
            const res = await a.sendUpdate({})
            expect(res).toBeUndefined()
        })


    }) 


})