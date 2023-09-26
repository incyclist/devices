import { EventLogger } from 'gd-eventlog';
import Daum8i from './comms'
import { MockBinding } from '@serialport/binding-mock';
import { SerialPortProvider,SerialInterface } from '../..';

import {Daum8iMock, Daum8iMockImpl, Daum8MockSimulator} from './mock'
import { ACTUAL_BIKE_TYPE } from '../constants';
import { Gender } from '../../../types/user';
import { EventEmitter } from 'stream';
import { sleep } from '../../../utils/utils';
import { hexstr } from './utils';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();


describe( 'Daum8i', ()=> {

    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )

        Daum8iMockImpl.reset();        
        MockBinding.reset();

    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as any)

    })

    describe( 'constructor', ()=> {

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)
            SerialPortProvider.getInstance().setBinding('tcpip', MockBinding)
        })
    
        afterAll( ()=> {
            EventLogger.useExternalLogger ( undefined as any)
    
        })
    
        beforeEach( ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
        })
    
    


        test('tcpip with normal ip number',()=>{
            
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})
            expect(bike.getPort()).toBe('192.168.2.11:51955')    
        })
        test('tcpip with weird ip numbering',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.002.011:51955'})
            expect(bike.getPort()).toBe('192.168.2.11:51955')    
        })

        test('serial with correct COM port',()=>{
            
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            expect(bike.getPort()).toBe('COM1')    
        })

    })

    describe( 'getInterface',()=>{
        test('serial defined',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            
            const res = bike.getInterface()
            expect(res).toBe('tcpip')
        })
        
        test('serial not defined',()=>{ // Due to use of Typescript, this should never happen
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            as any
            bike.serial = undefined;
            const res = bike.getInterface()
            expect(res).toBeUndefined()
        })
    })

    describe('pause Logging',()=>{
        test('not paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})
            bike.isLoggingPaused = false;
            bike.pauseLogging()
            expect(bike.isLoggingPaused).toBeTruthy()    
        })
        test('already paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})
            bike.isLoggingPaused = true;
            bike.pauseLogging()
            expect(bike.isLoggingPaused).toBeTruthy()    
        })
    })

    describe('resume Logging',()=>{
        test('not paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})
            bike.isLoggingPaused = false;
            bike.resumeLogging()
            expect(bike.isLoggingPaused).toBeFalsy()    
        })
        test('paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})
            bike.isLoggingPaused = true;
            bike.resumeLogging()
            expect(bike.isLoggingPaused).toBeFalsy()    
        })
    })

    describe('logEvent',()=>{
        test('does not log when paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})
            
            bike.isLoggingPaused = true;
            bike.logger.logEvent = jest.fn()

            bike.logEvent({message:'test'})
            
            expect(bike.logger.logEvent).not.toHaveBeenCalled()
        })
    })


    describe('connect',()=>{
        let bike;

        beforeEach( ()=>{
            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            
            bike.serial.openPort = jest.fn()
        })

        test('not connected',async ()=>{
            const sp = new EventEmitter();

            bike.isConnected = jest.fn().mockReturnValue(false)
            bike.serial.openPort.mockResolvedValueOnce(sp)
            
            const connected = await bike.connect()
            expect(connected).toBeTruthy()
            expect(bike.serial.openPort).toHaveBeenCalled()
        })

        test('not connected and connection fails ',async ()=>{
            const sp = new EventEmitter();

            bike.isConnected = jest.fn().mockReturnValue(false)
            bike.serial.openPort.mockResolvedValueOnce(null)
            
            const connected = await bike.connect()
            expect(connected).toBeFalsy()
            
        })

        test('not connected and connection throws error ',async ()=>{
            const sp = new EventEmitter();

            bike.isConnected = jest.fn().mockReturnValue(false)
            bike.serial.openPort.mockRejectedValue(new Error('error'))
            
            const connected = await bike.connect()
            expect(connected).toBeFalsy()
            
        })

        test('already connected',async ()=>{
            bike.isConnected = jest.fn().mockReturnValue(true)
            bike.sp = {}
            const connected = bike.connect()
            expect(connected).toBeTruthy()
            expect(bike.serial.openPort).not.toHaveBeenCalled()
        })

        test('already connected before but lost port',async ()=>{
            bike.isConnected = jest.fn().mockReturnValue(true)
            bike.serial.openPort.mockResolvedValueOnce(new EventEmitter)
            bike.sp = undefined
            const connected = await bike.connect()
            expect(connected).toBeTruthy()
            expect(bike.serial.openPort).toHaveBeenCalled()
        })

        test('error during connection',async ()=>{
            bike.serial.openPort.mockRejectedValue(new Error('error'))

            bike.isConnected = jest.fn().mockReturnValue(true)
            bike.sp = {}
            const connected = bike.connect()
            expect(connected).toBeTruthy()
            expect(bike.serial.openPort).not.toHaveBeenCalled()
        })
        test('error after connection',async ()=>{
            const sp = new EventEmitter();
            bike.serial.openPort.mockReturnValue(sp)
            bike.isConnected = jest.fn().mockReturnValue(false)
            bike.onPortError = jest.fn()

            
            const connected = await bike.connect()
            sp.emit('error', new Error('Some Error') )

            expect(connected).toBeTruthy()
            expect(bike.onPortError).toHaveBeenCalled( )
        })

        test('concurrent connections',async ()=>{
            const sp = new EventEmitter();          
            
            bike.serial.openPort = jest.fn( async ()=>{ await sleep(500); return sp;} )

            let connected1 = false;
            let connected2 = false;

            // first connection attempt
            const promise1 = bike.connect().then( (connected)=>connected1=connected)
            
            await sleep(100)
            expect(connected1).toBeFalsy()
            expect(bike.isConnected()).toBeFalsy()

            // 2nd conenction attempt
            const promise2 =  bike.connect().then( (connected)=>connected2=connected)
            await Promise.all( [promise1,promise2])

            expect(connected1).toBeTruthy()
            expect(connected2).toBeTruthy()
            expect(bike.serial.openPort).toHaveBeenCalled()
        })


    })

    describe('onPortError',()=>{ 
        let bike
        let sp;
        let error;
        let onPortError

        beforeEach( async ()=>{
            error = new Error('TEST')

            sp = new EventEmitter();                      
            sp.removeAllListeners  = jest.fn();
            
            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            
            bike.serial.openPort = jest.fn( ()=>{return sp;} )
            bike.logger.logEvent = jest.fn()
            bike.close = jest.fn();
            bike.rejectCurrent = jest.fn();
            onPortError = jest.spyOn( bike, 'onPortError')

            await bike.connect()

        })

        test('onPortError is called on error event',async ()=>{
            bike.sp.emit('error',error)                       
            expect(onPortError).toHaveBeenCalled()           
        })

        test('open, but idle',async ()=>{
            bike.sp.emit('error',error)

            expect(bike.logger.logEvent).toHaveBeenCalled()     // Event is logged
            expect(bike.rejectCurrent).not.toHaveBeenCalled()   // nothing to reject
            expect(bike.close).toHaveBeenCalled()               // port will be closed

        })

        test('error while opening',async ()=>{
            bike.connectState = 'Connecting'

            bike.sp.emit('error',error)

            expect(bike.logger.logEvent).toHaveBeenCalled()     // Event is logged
            expect(bike.rejectCurrent).not.toHaveBeenCalled()   // nothing to reject
            expect(bike.close).not.toHaveBeenCalled()           // port will not be closed

        })

        test('open, currently sending',async ()=>{
            bike.isSending = jest.fn().mockReturnValue(true)
            
            sp.emit('error',error)                       

            expect(bike.logger.logEvent).toHaveBeenCalled()     // Event is logged
            expect(bike.rejectCurrent).toHaveBeenCalled()       // current command will be rejected
            expect(bike.close).toHaveBeenCalled()               // port will be closed

        })

        test('closing',async ()=>{
            bike.connectState = 'Disconnecting'

            bike.sp.emit('error',error)

            expect(bike.logger.logEvent).not.toHaveBeenCalled() // Event is not logged
            expect(bike.rejectCurrent).not.toHaveBeenCalled()   // nothing to reject
            expect(bike.close).not.toHaveBeenCalled()           // port will not be closed

        })

        test('already closed',async ()=>{
            bike.connectState = 'Disconnected'
            bike.sp.emit('error',error)

            expect(bike.logger.logEvent).not.toHaveBeenCalled() // Event is not logged
            expect(bike.rejectCurrent).not.toHaveBeenCalled()   // nothing to reject
            expect(bike.close).not.toHaveBeenCalled()           // port will not be closed
            
            
        })
    })



    describe('close',()=>{
        let bike;

        beforeEach( ()=>{
            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            
            bike.flush = jest.fn()
            bike.serial.closePort = jest.fn()
            bike.sp  = new EventEmitter();
        })

        test('not connected',async ()=>{            
            bike.connectState = 'Disconnected'
                        
            const closed = await bike.close()
            expect(closed).toBeTruthy()
            expect(bike.sp).toBeNull()            
            expect(bike.flush).not.toHaveBeenCalled()
        })

        test('properly connected',async ()=>{            
            bike.connectState = 'Connected'
            
            const closed = await bike.close()
            expect(closed).toBeTruthy()
            expect(bike.sp).toBeNull()                        
            expect(bike.flush).toHaveBeenCalled()
        })
        test('connecting',async ()=>{            
            bike.connectState = 'Connecting'
            
            const closed = await bike.close()
            expect(closed).toBeTruthy()
            expect(bike.sp).toBeNull()                        
            expect(bike.flush).toHaveBeenCalled()
        })


        test('connected but sp missing',async ()=>{            
            bike.connectState = 'Connected'
            bike.sp = null;
            
            const closed = await bike.close()
            expect(closed).toBeTruthy()
            expect(bike.sp).toBeNull()                        
            expect(bike.flush).not.toHaveBeenCalled()
        })

        test('closePort throws error',async ()=>{            
            bike.connectState = 'Connected'
            bike.serial.closePort.mockRejectedValue( new Error('error text'))
            bike.logEvent = jest.fn()

            const closed = await bike.close()
            expect(closed).toBeFalsy()
            expect(bike.sp).toBeNull()                        
            expect(bike.connectState).toBe('Disconnecting')                        
            expect(bike.flush).toHaveBeenCalled()
            expect(bike.logEvent).toHaveBeenCalledWith( expect.objectContaining({reason:'error text'}))
        })

        test('concurrent close requests',async ()=>{                       
            bike.connectState = 'Connected'

            bike.flush = jest.fn( async ()=> { await sleep(100); return true})
            const closePort = jest.spyOn( bike.serial,'closePort')

            let closed1 = false, closed2=false

            const promise1 = bike.close().then( closed => {closed1=closed})   
            await sleep(10)         
            const promise2 = bike.close().then( closed => {closed2=closed})
            await Promise.all([promise1,promise2])

            expect(closed1).toBeTruthy()
            expect(closed2).toBeTruthy()

            expect(bike.sp).toBeNull()                        
            expect(bike.flush).toHaveBeenCalledTimes(1)
            expect(closePort).toHaveBeenCalledTimes(1)
        })

    })

    describe('flush',()=>{
        let bike;

        beforeEach( ()=>{
            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            
        })


        test('not writing',async ()=>{            
            bike.writePromise = null
                        
            await bike.flush()
            expect(bike.writePromise).toBeFalsy()
        })

        test('writing is ongoing',async ()=>{            
            bike.writePromise = sleep(100)
                        
            await bike.flush()
            expect(bike.writePromise).toBeFalsy()
        })


    })

    describe('write',()=>{
        let bike;

        beforeEach( ()=>{
            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            
            bike.connectState= 'Connected'
        })

        test('concurrent writes',async ()=>{            

            let msg = ""
            bike.portWrite = jest.fn( (buffer) => { msg = msg+ hexstr(buffer)})

            bike.write(Buffer.from([0x06]))
            await bike.write(Buffer.from([0x15]))
            expect(msg).toBe('0615')
            
        })

        test('error during write',async ()=>{            
            let error = new Error('XXX')

            bike.sp = { write: jest.fn( () => { throw error})}
            bike.logger.logEvent = jest.fn()

            await bike.write()

            expect(bike.logger.logEvent).toBeCalledWith({message:'write failed',error:error.message})
            expect(bike.writePromise).toBeNull()
        })


    })

    describe( 'functions', ()=> {

        let bike;
        let simulator;

        beforeEach( async ()=>{
            MockBinding.reset();
            MockBinding.createPort('COM1')

            simulator = new Daum8MockSimulator();
            Daum8iMockImpl.reset();        
            Daum8iMockImpl.getInstance().setSimulator('COM1',simulator)
            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'serial', binding:Daum8iMock}), path:'COM1' })
            
            try {
                await bike.connect();
            }
            catch (err) {
                if (process.env.DEBUG)
                    console.log(err.message, err.stack)
            }
        })

        afterEach( async ()=> {
            await bike.close();
        })

        test('getProtocolVersion',async ()=> {
        
            //MockSerialPort.setResponse( 'V00' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'V00', getAsciiArrayFromStr('201') ) ) } )            
            simulator.protoVersion = '201'
            const version1 = await bike.getProtocolVersion();
            expect(version1).toBe('2.01');

        
            simulator.protoVersion = '301'
            const version2 = await bike.getProtocolVersion();           
            expect(version2).toBe('3.01');
    
        
        })
    
        
        test('getDashboardVersion',async ()=> {
                        
            let version = await bike.getDashboardVersion();
            expect(version).toBe('Version 1.380');

            simulator.dashboardVersion = 'Version 1.100'
            version = await bike.getDashboardVersion();
            expect(version).toBe('Version 1.100');
        })

    
        describe('getDeviceType',()=> {
    
            test('run',async ()=> {
                const deviceType = await bike.getDeviceType()
                expect(deviceType).toBe('run');    
            })
    
            test('bike',async ()=> {
                simulator.deviceType = 2;                
                const deviceType = await bike.getDeviceType()
                expect(deviceType).toBe('bike');
            })
    
            test('lyps',async ()=> {
                simulator.deviceType = 7;               
                const deviceType = await bike.getDeviceType()
                expect(deviceType).toBe('lyps');
            })
    
    
            test('unknown value',async ()=> {
                simulator.deviceType = 5;               

                let error;
                try {
                    await bike.getDeviceType()
                }
                catch(err) { error=err}
                expect(error.message).toBe('unknown device type 5');
            })
    
    
        })
    
            
    
        describe('getActualBikeType',()=> {
                
            test('allround',async ()=> {
                const deviceType = await bike.getActualBikeType()
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.ALLROUND);    
            })
    
            test('bike',async ()=> {
                simulator.actualType = 1
                const deviceType = await bike.getActualBikeType()
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.RACE);
            })
    
            test('lyps',async ()=> {
                simulator.actualType = 2
                const deviceType = await bike.getActualBikeType()
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.MOUNTAIN);
            })
    
    
            test('unknown numeric value',async ()=> {
                simulator.actualType = 5
                let error;
                try {
                    await bike.getActualBikeType()
                }
                catch(err) { error=err}
                expect(error.message).toBe('unknown actual device type 53');
            })
    
    
            test('ACK timeout',async ()=> {
                
                bike.settings = {timeout:200};
                simulator.simulateACKTimeout();
               
   
                let error;
                try {
                    await bike.getActualBikeType();
                }
                catch(err) { error=err}
                expect(error.message).toBe('ACK timeout');
            },10000)

            
            test('response timeout',async ()=> {
                bike.settings = {timeout:200};
                simulator.simulateTimeout(500);
 
    
                let error;
                try {
                    await  bike.getActualBikeType();
                }
                catch(err) { error=err}

                // TODO: verify that command was retried 3 times
                expect(error.message).toBe('RESP timeout');
            },1000)

        })

        describe('setActualDeviceType',()=> {
                
            test('allround',async ()=> {
                const deviceType = await bike.setActualBikeType(ACTUAL_BIKE_TYPE.ALLROUND)
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.ALLROUND);    
            })
    
            test('bike',async ()=> {
                simulator.actualType = 0
                const deviceType = await bike.setActualBikeType(ACTUAL_BIKE_TYPE.RACE)
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.RACE);
            })
    
            test('lyps',async ()=> {
                simulator.actualType = 0
                const deviceType = await bike.setActualBikeType(ACTUAL_BIKE_TYPE.MOUNTAIN)
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.MOUNTAIN);
            })
        })

        describe('getTrainingData',()=> { 

        })

        describe('setLoadControl',()=> { 
            test('set ON',async ()=>{
                simulator.loadControl = 0;
                await bike.setLoadControl(true)
                expect(simulator.loadControl).toBe(1)
            })

            test('set OFF',async ()=>{
                simulator.loadControl = 1;
                await bike.setLoadControl(false)
                expect(simulator.loadControl).toBe(0)
            })

        })

        describe('getLoadControl',()=> { 
            test('ON',async ()=>{
                simulator.loadControl = 1;
                const loadControl = await bike.getLoadControl(true)
                expect(loadControl).toBe(true)
            })

            test('OFF',async ()=>{
                simulator.loadControl = 0;
                const loadControl = await bike.getLoadControl(true)
                expect(loadControl).toBe(false)
            })

        })



        test('setPower',async ()=> {
            let power;

            simulator.power = 0
            power = await bike.setPower(120)
            expect(power).toBe(120);    

            power = await bike.setPower(10.5)
            expect(power).toBe(10);    

            power = await bike.setPower(800)
            expect(power).toBe(800);    

        })

        test('getPower',async ()=> { 
            let power;
            simulator.power = 120
            power = await bike.getPower()
            expect(power).toBe(120);    

            simulator.power = 50
            power = await bike.getPower()
            expect(power).toBe(50);    

        })
        
        describe('setPerson', ()=> {            

            test( 'male',async ()=> { 
                const res = await bike.setPerson({weight:88.5,length:181})
                expect(res).toBeTruthy()
    
                expect(simulator.person.weight).toBe(88.5)
                expect(simulator.person.length).toBe(181)
                expect(simulator.person.sex).toBe(Gender.MALE)
    
            })

            test( 'female',async ()=> { 
                const res = await bike.setPerson({weight:88.5,length:161,sex:Gender.FEMALE})
                expect(res).toBeTruthy()
    
                expect(simulator.person.weight).toBe(88.5)
                expect(simulator.person.length).toBe(161)
                expect(simulator.person.sex).toBe(Gender.FEMALE)
    
            })

        })

        describe('programUpload',()=> { 

        })
        describe('startProgram',()=> { 

        })

        test('setGear',async ()=> {
            simulator.gear = 1;
            const gear = await bike.setGear(11)
            expect(gear).toBe(11);    
        })

        test('getGear',async ()=> {
            let gear;

            simulator.gear = 10;
            gear = await bike.getGear()
            expect(gear).toBe(10);

            simulator.gear = 11;
            gear = await bike.getGear()
            expect(gear).toBe(11);


        })


        test('no response = ACK timeout',async ()=> {
        

            simulator.simulateACKTimeout();
            bike.sendNAK = jest.fn()
            bike.getTimeoutValue = jest.fn(()=>100)     // TIMEOUT after 100ms

            let error = {} as any;
            try {
                const res = await bike.getProtocolVersion();
            }
            catch (err) { error = err}
            
            expect(error.message).toBe('ACK timeout'); // as simulated server is not sending an ACK
        })

        test('illegal checksum',async ()=> {

            simulator.simulateChecksumError();
            simulator.timeoutNAKRetry = 1000;
            simulator.onNAK = jest.fn()

            bike.settings= { timeout:50};
            let error = {} as any;
            try {
                const res = await bike.getProtocolVersion();
            }
            catch (err) { error = err}
            expect(simulator.onNAK).toBeCalled();

            expect(error.message).toBe('RESP timeout'); // as mock is not sending the correct response
        })

    
        test('illegal checksum, followed by correction',async ()=> {
            simulator.simulateChecksumError();
            simulator.timeoutNAKRetry = 10;
            simulator.onNAK = jest.fn()
        
            let error = undefined;
            let res;
            try {
                res = await bike.getProtocolVersion();
            }
            catch (err) { error = err}
            expect(simulator.onNAK).toBeCalled();
            expect(error).toBeUndefined();
            expect(res).toBe('2.01')
        })

        /*


        test('partial response',async ()=> {
        
            MockSerialPort.setResponse( 'X70' , ( command, sendData) => { 
                sendData( [0x06]); 
                sendData( [0x01]); 
                sendData( [0x58,0x37,0x30,0x30,0x1d,0x30,0x1d,0x30,0x2e]);
                sendData( [0x30,0x30,0x1d,0x30,0x2e,0x30,0x1d,0x30,0x1d,0x20]);
                sendData( [0x30,0x2e,0x30,0x1d,0x35,0x30,0x1d,0x20,0x30,0x2e,0x30]); 
                sendData( [0x1d,0x20,0x30,0x2e,0x30,0x1d,0x20,0x30,0x2e,0x30,0x1d,0x31,0x30,0x1d,0x30,0x1d,0x30,0x1d,0x33,0x34,0x17]); 
            })            
            bike.sendNAK = jest.fn()
            bike.sendACK = jest.fn()
            bike.settings= { tcpip:{timeout:500}};
            let error = undefined;
            try {
                await bike.getTrainingData();
            }
            catch (err) { error = err }
            expect(error).toBeUndefined()
            expect(bike.sendACK).toBeCalled();
            
        })

        */
    
    })

    /*
    describe( 'concurrency', ()=> {
        let bike;

        beforeEach( async ()=>{
            bike = new Daum8i( {port:'COM1'})
            try {
                await bike.saveConnect();
            }
            catch (err) {
                //
            }
        })

        afterEach( async ()=> {
            await bike.saveClose();
        })

        test('getPower & GetTraings',async ()=> {
            
            function trainingData() {

                const GS = 0x1D as never
                let payload = [];
                append(payload, getAsciiArrayFromStr('10'));payload.push(GS); // time
                append(payload, getAsciiArrayFromStr('99'));payload.push(GS); // heartrate
                append(payload, getAsciiArrayFromStr('30.0'));payload.push(GS); // speed
                append(payload, getAsciiArrayFromStr('0'));payload.push(GS); // slope        
                append(payload, getAsciiArrayFromStr('100'));payload.push(GS); // distance
                append(payload, getAsciiArrayFromStr('90.1'));payload.push(GS); // cadence
                append(payload, getAsciiArrayFromStr('30'));payload.push(GS); // power
                append(payload, getAsciiArrayFromStr('130.2'));payload.push(GS); // physEnergy
                append(payload, getAsciiArrayFromStr('130.3'));payload.push(GS); // realEnergy
                append(payload, getAsciiArrayFromStr('13.1'));payload.push(GS); // torque
                append(payload, getAsciiArrayFromStr('11'));payload.push(GS); // gear
                append(payload, getAsciiArrayFromStr('1'));payload.push(GS); // deviceState
                append(payload, getAsciiArrayFromStr('0')) // speedStatus
                return payload;    
            }
            


            // mock always return 10, regardless which gear was sent
            MockSerialPort.setResponse( 'S23' , ( command, sendData) => { sendData( [0x06]); sendData(  buildMessage( 'S23','50.0') ) } )
            MockSerialPort.setResponse( 'X70' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'X70', trainingData() ))} )

            let error = undefined;
            const run = ( ()  => {
                return new Promise( (resolve,reject) =>  {
    
                    Promise.all ( [
                        bike.setPower(50),                        
                        bike.getTrainingData( )
                    ])
                    .then( values => resolve(values))
                    .catch (err => {  error = err; resolve({})})
                })
    
                
            });
        
            await run();
            expect(error).toBeUndefined();
        },5000)

    
    })
    */


    /*
    describe( 'unexpected data', ()=> {   

        let bike;

        beforeEach( async ()=>{
            bike = new Daum8i( {port:'COM1'})
            try {
                await bike.saveConnect();
            }
            catch (err) {
                //
            }
        })

        afterEach( async ()=> {
            await bike.saveClose();
        })

        test('cycling data while nothing is expected',async ()=>{
  
            function trainingData() {

                const GS = 0x1D as never
                let payload = [];
                append(payload, getAsciiArrayFromStr('10'));payload.push(GS); // time
                append(payload, getAsciiArrayFromStr('99'));payload.push(GS); // heartrate
                append(payload, getAsciiArrayFromStr('30.0'));payload.push(GS); // speed
                append(payload, getAsciiArrayFromStr('0'));payload.push(GS); // slope        
                append(payload, getAsciiArrayFromStr('100'));payload.push(GS); // distance
                append(payload, getAsciiArrayFromStr('90.1'));payload.push(GS); // cadence
                append(payload, getAsciiArrayFromStr('30'));payload.push(GS); // power
                append(payload, getAsciiArrayFromStr('130.2'));payload.push(GS); // physEnergy
                append(payload, getAsciiArrayFromStr('130.3'));payload.push(GS); // realEnergy
                append(payload, getAsciiArrayFromStr('13.1'));payload.push(GS); // torque
                append(payload, getAsciiArrayFromStr('11'));payload.push(GS); // gear
                append(payload, getAsciiArrayFromStr('1'));payload.push(GS); // deviceState
                append(payload, getAsciiArrayFromStr('0')) // speedStatus
                return payload;    
            }
                                
            MockSerialPort.setResponse( 'S23' , ( command, sendData) => { sendData( [0x06]); } )
            MockSerialPort.setResponse( 'X70' , ( command, sendData) => { sendData( [0x06]); setTimeout( ()=>{sendData( buildMessage( 'X70', trainingData() ) )}, 500)   } )
            const data = buildMessage( 'X70', trainingData() )
            
            
            bike.setPower(50).catch( console.log)
            bike.sp.emit('error',new Error('sth'))

            const sleep = (ms) => new Promise( resolve=> setTimeout(resolve,ms))


            await sleep(500)
            await bike.saveConnect()
            await bike.getTrainingData()
            
            

            bike.onData(data)
            bike.onData(data)
            bike.onData(data)
            bike.onData(data)
            
            
        })


        test('ech of previous command while waiting for ACK',async ()=>{
  
                                
            MockSerialPort.setResponse( 'S23' , ( message, sendData) => { 
                const ACK = Buffer.from([0x06])
                const echo = Buffer.from(message)
                const response = Buffer.concat( [echo,ACK]  )
                sendData( response); 
                
            })

            MockSerialPort.setACKHandler( (sendData)=> { sendData( Buffer.from('015332333136372e3030383417','hex'))
                
            })

            
            bike.setPower(50).catch( console.log)

            

            const sleep = (ms) => new Promise( resolve=> setTimeout(resolve,ms))

            console.log('sleeping')
            await sleep(2000)
            console.log('sleep done')
            

            
            
        })


    })
    */


})