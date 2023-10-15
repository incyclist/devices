import { EventLogger } from 'gd-eventlog';
import Daum8i from './comms'
import { MockBinding } from '@serialport/binding-mock';
import { SerialPortProvider,SerialInterface } from '../..';

import {Daum8iMock, Daum8iMockImpl, Daum8MockSimulator} from './mock'
import { Gender } from '../../../types/user';
import { EventEmitter } from 'stream';
import { sleep } from '../../../utils/utils';
import { hexstr } from './utils';
import { ACKTimeout, ACTUAL_BIKE_TYPE, ResponseObject,Route } from './types';
import { IncyclistBikeData } from '../../../types';

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
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'});
            (bike as any).isLoggingPaused = false;
            bike.pauseLogging()
            expect((bike as any).isLoggingPaused).toBeTruthy()    
        })
        test('already paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'});
            (bike as any).isLoggingPaused = true;
            bike.pauseLogging()
            expect((bike as any).isLoggingPaused).toBeTruthy()    
        })
    })

    describe('resume Logging',()=>{
        test('not paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'});
            (bike as any).isLoggingPaused = false;
            bike.resumeLogging()
            expect((bike as any).isLoggingPaused).toBeFalsy()    
        })
        test('paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'});
            (bike as any).isLoggingPaused = true;
            bike.resumeLogging()
            expect((bike as any).isLoggingPaused).toBeFalsy()    
        })
    })

    describe('logEvent',()=>{
        test('does not log when paused',()=>{
            const bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})
            
            bike.pauseLogging()
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
            bike.isConnected = jest.fn().mockReturnValue(false)
            bike.serial.openPort.mockResolvedValueOnce(null)
            
            const connected = await bike.connect()
            expect(connected).toBeFalsy()
            
        })

        test('not connected and connection throws error ',async ()=>{
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
            bike.serial.openPort.mockResolvedValueOnce(new EventEmitter())
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

    describe('onData',()=>{
        class Test extends Daum8i {
            getState() { 
                const {waitingForACK,waitingForStart, waitingForEnd,data,partialCmd } = this.recvState
                const q = data as any

                return {ack:waitingForACK,start:waitingForStart,end:waitingForEnd,data:JSON.parse(JSON.stringify(q.data)),cmd:partialCmd}
            }

            setPartialCmdHex(partial:string) {
                const cmd = Buffer.from(partial,'hex').toString()
                this.recvState.partialCmd = cmd
            }

            addData(data:ResponseObject|ResponseObject[])  {
                const arr:ResponseObject[] = Array.isArray(data) ? data : [data]                
                arr.forEach(d=>{this.recvState.data.enqueue(d)})                
            }
        }

        let bike:Test;       

        beforeEach( ()=>{
            bike = new Test( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})          
            
        })

        describe( 'initial state',()=>{
            test('ACK',()=>{
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:false,data:[]})

                bike.onData([0x06])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:false,data:[]})

            })

        })

        describe( 'waiting for ack',()=>{
            test('ACK',()=>{
                bike.setState(true,false,false)
                bike.onData([0x06])
                expect(bike.getState()).toMatchObject({ack:false, start:true, end:false,data:[{type:'ACK'}]})
            })
            test('ACK and start of new message',()=>{
                bike.setState(true,false,false)
                bike.onData([0x06,0x01,0x59,0x30,0x30])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[{type:'ACK'}],cmd:'Y00'})
            })
            test('NAK',()=>{
                bike.setState(true,false,false)
                bike.onData([0x15])
                expect(bike.getState()).toMatchObject({ack:false, start:true, end:false,data:[{type:'NAK'}]})
            })
            test('NAK and start of new message',()=>{
                bike.setState(true,false,false)
                bike.onData([0x15,0x01,0x59,0x30,0x30])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[{type:'NAK'}],cmd:'Y00'})
            })

            test('anything else',()=>{
                bike.setState(true,false,false)
                bike.onData([0x01])
                expect(bike.getState()).toMatchObject({ack:true, start:false, end:false,data:[]})
                bike.onData([0x17])
                expect(bike.getState()).toMatchObject({ack:true, start:false, end:false,data:[]})
                bike.onData([0xAA])
                expect(bike.getState()).toMatchObject({ack:true, start:false, end:false,data:[]})
            })
        })

        describe( 'waiting for start',()=>{
            test('SOH',()=>{
                bike.setState(false,true,false)
                bike.onData([0x01])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[]})
            })

            test('anything else',()=>{
                bike.setState(false,true,false)
                bike.onData([0x06])
                expect(bike.getState()).toMatchObject({ack:false, start:true, end:false,data:[]})
                bike.onData([0x15])
                expect(bike.getState()).toMatchObject({ack:false, start:true, end:false,data:[]})
                bike.onData([0x17])
                expect(bike.getState()).toMatchObject({ack:false, start:true, end:false,data:[]})
                bike.onData([0xAA])
                expect(bike.getState()).toMatchObject({ack:false, start:true, end:false,data:[]})
            })
        })

        describe( 'waiting for end',()=>{
            test('ETB - valid cmd',()=>{
                bike.setState(false,false,true)
                bike.setPartialCmdHex('5930303835')
                bike.onData([0x17])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:false,data:[{type:'Response',cmd:'Y00',data:''}]})
            })

            test('ETB - incomplete',()=>{
                bike.setState(false,false,true)
                bike.onData([0x17])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:false,data:[{type:'Error'}]})
            })

            test('anything else',()=>{
                bike.setState(false,true,false)
                bike.onData([0x01])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[], cmd:''})
                bike.onData([0x06])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[], cmd:''})
                bike.onData([0x15])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[], cmd:''})
                bike.onData('A')
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[], cmd:'A'})
            })

            test('multiple partial command',()=>{
                bike.setState(false,false,true)
                
                bike.onData([0x59,0x30])
                bike.onData([0x30,0x38,0x35])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:true,data:[], cmd:'Y0085'})
                bike.onData([0x17])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:false,data:[{type:'Response',cmd:'Y00',data:''}]})
            })

            test('additional data will be ignored',()=>{
                bike.setState(false,false,true)
                bike.setPartialCmdHex('5930303835')
                bike.onData([0x17,0x06])
                expect(bike.getState()).toMatchObject({ack:false, start:false, end:false,data:[{type:'Response',cmd:'Y00',data:''}]})
            })

        })

    })
    describe('send',()=>{
        let bike:Daum8i
        let bikeInt

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)
        })
    
    
        beforeEach( ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'tcpip'}), path:'192.168.2.11:51955'})            
            bikeInt= bike as any;
            bike.logEvent = jest.fn()
            bike.isConnected = jest.fn().mockReturnValue(true)
            bike.write = jest.fn()
            bike.waitForACK = jest.fn().mockResolvedValue(true)
            bike.waitForResponse = jest.fn().mockResolvedValue(undefined)

        })
            
        test('successfull sending',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}

            bike.waitForACK = jest.fn().mockResolvedValue(true)
            bike.waitForResponse = jest.fn().mockResolvedValue(test)

            const res = await bike.send({logString:'test', command:'A1', isBinary:false})

            expect(res).toEqual(test)
            expect(bike.logEvent).toHaveBeenCalledTimes(4)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:ACK received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(3,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(4,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending ACK', port: '192.168.2.11:51955'}))
            expect(bikeInt.sendCmdPromise).toBeNull()
        })


        test('single NAK Failure',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}
            let ackCallNo = 0;
            bike.waitForACK = async ():Promise<boolean>=>{ if(++ackCallNo>1) return true; return false}
            bike.waitForResponse = jest.fn().mockResolvedValue(test)

            const res = await bike.send({logString:'test', command:'A1', isBinary:false})

            expect(res).toEqual(test)

            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:sending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:NAK received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(3,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:resending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(4,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:ACK received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(5,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(6,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:sending ACK', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenCalledTimes(6)
            expect(bikeInt.sendCmdPromise).toBeNull()
        })

        test('ACK Timeout',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}            
            bike.waitForACK = jest.fn().mockRejectedValue( new ACKTimeout())
            bike.waitForResponse = jest.fn().mockResolvedValue(test)

            await expect( async ()=> {await bike.send({logString:'test', command:'A1', isBinary:false})})
                .rejects
                .toThrow('ACK timeout')

            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:sending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:error:',error:'ACK timeout', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenCalledTimes(2)
            expect(bikeInt.sendCmdPromise).toBeNull()
        })


        test('more than 5 NAK Failure',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}            
            bike.waitForACK = jest.fn().mockResolvedValue(false)
            bike.waitForResponse = jest.fn().mockResolvedValue(test)


            await expect( async ()=> {await bike.send({logString:'test', command:'A1', isBinary:false})})
                .rejects
                .toThrow('ACK Error')

            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:sending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:NAK received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(3,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:resending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(4,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:NAK received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(5,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:resending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(6,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:NAK received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(7,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:resending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(8,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:NAK received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(9,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:resending:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(10,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:NAK received:', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(11,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:error:',error:'ACK Error', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenCalledTimes(11)
            expect(bikeInt.sendCmdPromise).toBeNull()
        })



        test('not connected with successfull reconnect',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}            
            bike.waitForACK = jest.fn().mockResolvedValue(true)
            bike.waitForResponse = jest.fn().mockResolvedValue(test)


            bike.isConnected = jest.fn().mockReturnValueOnce(false)
            bike.connect = jest.fn().mockResolvedValue(true)

            const res = await bike.send({logString:'test', command:'A1', isBinary:false})

            expect(res).toBe(test)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:ACK received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(3,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(4,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending ACK', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenCalledTimes(4)
            expect(bikeInt.sendCmdPromise).toBeNull()
        })

        test('not connected with failed reconnect',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}
            bike.waitForACK = jest.fn().mockResolvedValue(true)
            bike.waitForResponse = jest.fn().mockResolvedValue(test)
            bike.isConnected = jest.fn().mockReturnValueOnce(false)
            bike.connect = jest.fn().mockResolvedValue(false)

            await expect( async ()=> {await bike.send({logString:'test', command:'A1', isBinary:false})})
                .rejects
                .toThrow('not connected')

            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({'cmd': 'test (A1)', 'message': 'sendCommand:error:',error:'not connected', 'port': '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenCalledTimes(2)
            expect(bikeInt.sendCmdPromise).toBeNull()

        })

        


        test('duplacate requests',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}

            bike.waitForACK = jest.fn().mockResolvedValue(true)
            bike.waitForResponse = jest.fn().mockResolvedValue(test)

            let res1, res2;
            const first = bike.send({logString:'test', command:'A1', isBinary:false}).then((res)=>{res1=res})
            await sleep(10)
            const second = bike.send({logString:'test', command:'A2', isBinary:false}).then((res)=>{res2=res})
            await Promise.all( [first,second])
          
            expect(res1).toBe(test)
            expect(res2).toBe(test)

            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:ACK received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(3,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(4,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending ACK', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(5,expect.objectContaining({cmd: 'test (A2)', message: 'sendCommand:sending:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(6,expect.objectContaining({cmd: 'test (A2)', message: 'sendCommand:ACK received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(7,expect.objectContaining({cmd: 'test (A2)', message: 'sendCommand:received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(8,expect.objectContaining({cmd: 'test (A2)', message: 'sendCommand:sending ACK', port: '192.168.2.11:51955'}))


            expect(bike.logEvent).toHaveBeenCalledTimes(8)

            expect(bikeInt.sendCmdPromise).toBeNull()
        })

        
        test('duplacate requests - busy timeout',async ()=>{
            const test:ResponseObject = {type:'Response',data:'12'}

            bike.waitForACK = jest.fn( async ()=>{ await sleep(250); return true  })
            bike.waitForResponse = jest.fn( async ()=>{ await sleep(250); return test  })
            bike.getBusyTimeout = jest.fn().mockReturnValue(50)

            const first = bike.send({logString:'test', command:'A1', isBinary:false})
            await sleep(10)
            const second = bike.send({logString:'test', command:'A2', isBinary:false})

            const res = await Promise.allSettled( [
                first,
                second
            ])

            console.log(JSON.stringify(res))
            expect(res[0]).toEqual( {status:'fulfilled',value:test})
            expect(res[1]).toMatchObject( {status:'rejected'})
            
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,expect.objectContaining({cmd: 'test (A2)', message: 'sendCommand:waiting:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(3,expect.objectContaining({cmd: 'test (A2)', message: 'sendCommand:error:',error:'BUSY timeout', 'port': '192.168.2.11:51955'}))

            expect(bike.logEvent).toHaveBeenNthCalledWith(4,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:ACK received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(5,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:received:', port: '192.168.2.11:51955'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(6,expect.objectContaining({cmd: 'test (A1)', message: 'sendCommand:sending ACK', port: '192.168.2.11:51955'}))

            expect(bikeInt.sendCmdPromise).toBeNull()
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
            bike.getAckTimeoutValue = jest.fn( ()=>500)
            bike.getTimeoutValue = jest.fn( ()=>500)
            
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
            simulator.cleanup()
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
                
                bike.getAckTimeoutValue = jest.fn().mockReturnValue(200);
                simulator.simulateACKTimeout();
               
   
                let error;
                try {
                    await bike.getActualBikeType();
                }
                catch(err) { error=err}
                expect(error.message).toBe('ACK timeout');
            },1000)

            
            test('response timeout',async ()=> {
                bike.getTimeoutValue = jest.fn().mockReturnValue(200);
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

            power = await bike.setPower('10.5')
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

            test( 'illegal response',async ()=> { 
                simulator.simulateReservedError()

                
                await expect( async ()=>{ await bike.setPerson({weight:88.5,length:161,sex:Gender.FEMALE})})
                    .rejects
                    .toThrow('Illegal Response')
    
            })

        })

        describe('programUploadInit',()=> { 
            test( 'success',async ()=> { 
                const res = await bike.programUploadInit()
                expect(res).toBeTruthy()
            })

            test( 'illegal response',async ()=> { 
                simulator.simulateReservedError()
               
                await expect( async ()=>{ await bike.programUploadInit()})
                    .rejects
                    .toThrow('Illegal Response')
    
            })


        })


        describe('programUploadStart',()=> { 
            const route:Route = {
                programId:1,
                points:[],
                type:'',
                lapMode:false,
                totalDistance:0
            }

            test( 'success',async ()=> { 
                const res = await bike.programUploadStart('race',route)
                expect(res).toBeTruthy()
            })

            test( 'illegal response',async ()=> { 
                simulator.simulateReservedError()
               
                await expect( async ()=>{ await bike.programUploadStart('race',route)})
                    .rejects
                    .toThrow('Illegal Response')
    
            })

            test( 'lap Mode',async ()=> { 
                const lapRoute = Object.assign({},route)
                lapRoute.lapMode = true;

                const res = await bike.programUploadStart('race',lapRoute)
                expect(res).toBeTruthy()
                expect(simulator.program?.lapMode).toBeTruthy()
            })
            test( 'no lap Mode',async ()=> { 
                const res = await bike.programUploadStart('race',route)
                expect(res).toBeTruthy()
                expect(simulator.program?.lapMode).toBeFalsy()
            })


        })

        describe('programUploadSendBlock',()=> { 
            const epp = Buffer.from('00000000','hex')

            test( 'success',async ()=> { 
                const res = await bike.programUploadSendBlock(epp,0)
                expect(res).toBeTruthy()
            })

            test( 'illegal response',async ()=> { 
                simulator.simulateReservedError()
               
                await expect( async ()=>{ await bike.programUploadSendBlock(epp,0)})
                    .rejects
                    .toThrow('Illegal Response')
    
            })

            test( 'offset beyond epp data',async ()=> { 
                bike.sendReservedDaum8iCommand = jest.fn()
                const res = await bike.programUploadSendBlock(epp,10)

                // will be ignored and returns true
                expect(res).toBeTruthy()
                expect(bike.sendReservedDaum8iCommand).not.toHaveBeenCalled()

            })

        })
        describe('programUploadDone',()=> { 

            test( 'success',async ()=> { 
                const res = await bike.programUploadDone()
                expect(res).toBeTruthy()
            })

            test( 'illegal response',async ()=> { 
                simulator.simulateReservedError()
               
                await expect( async ()=>{ await bike.programUploadDone()})
                    .rejects
                    .toThrow('Illegal Response')
    
            })

        })
       

        describe('startProgram',()=> { 
            test( 'success',async ()=> { 
                const res = await bike.startProgram(1)
                expect(res).toBeTruthy()
                expect(simulator.program?.id).toBe(1)
                expect(simulator.program?.started).toBeTruthy()
            })

            test( 'illegal response',async ()=> { 
                simulator.simulateReservedError()
               
                await expect( async ()=>{ await bike.startProgram(1)})
                    .rejects
                    .toThrow('Illegal Response')
    
            })


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

        test('getTrainingData',async ()=> {
            let data

            const bikeData = Object.assign({},simulator.data)

            data = await bike.getTrainingData() as IncyclistBikeData
            expect(data).toMatchObject({speed:0, time:0, isPedalling:false, power:0, distanceInternal:0, pedalRpm:0,heartrate:0 })

            simulator.data = Object.assign(bikeData,{heartrate:100})
            data = await bike.getTrainingData() as IncyclistBikeData
            expect(data).toMatchObject({speed:0, time:0, isPedalling:false, power:0, distanceInternal:0, pedalRpm:0,heartrate:100 })

            simulator.data = Object.assign(bikeData,{pedalRpm:100})
            data = await bike.getTrainingData() as IncyclistBikeData
            expect(data).toMatchObject({speed:0, time:0, isPedalling:true, power:0, distanceInternal:0, pedalRpm:100,heartrate:100 })

            simulator.data = Object.assign(bikeData,{power:200})
            data = await bike.getTrainingData() as IncyclistBikeData
            expect(data).toMatchObject({speed:0, time:0, isPedalling:true, power:200, distanceInternal:0, pedalRpm:100,heartrate:100 })

            simulator.data = Object.assign(bikeData,{time:1})
            data = await bike.getTrainingData() as IncyclistBikeData
            expect(data).toMatchObject({speed:0, time:1, isPedalling:true, power:200, distanceInternal:0, pedalRpm:100,heartrate:100 })

            simulator.data = Object.assign(bikeData,{v:10})
            data = await bike.getTrainingData() as IncyclistBikeData
            expect(data).toMatchObject({speed:36, time:1, isPedalling:true, power:200, distanceInternal:0, pedalRpm:100,heartrate:100 })

            simulator.data = Object.assign(bikeData,{distanceInternal:123})
            data = await bike.getTrainingData() as IncyclistBikeData
            expect(data).toMatchObject({speed:36, time:1, isPedalling:true, power:200, distanceInternal:123, pedalRpm:100,heartrate:100 })

        })

        test('no response = ACK timeout',async ()=> {
        

            simulator.simulateACKTimeout();
            bike.sendNAK = jest.fn()
            bike.getAckTimeoutValue = jest.fn(()=>100)     // TIMEOUT after 100ms

            let error = {} as any;
            try {
                await bike.getProtocolVersion();
            }
            catch (err) { error = err}
            
            expect(error.message).toBe('ACK timeout'); // as simulated server is not sending an ACK
        })

        test('illegal checksum',async ()=> {

            simulator.simulateChecksumError();
            simulator.timeoutNAKRetry = 1000;
            simulator.onNAK = jest.fn()

            bike.getTimeoutValue = jest.fn(()=>50)     // TIMEOUT after 50ms
            let error = {} as any;
            try {
                await bike.getProtocolVersion();
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
    
    })

    describe( 'upload', ()=> {

        let bike;

        beforeEach( async ()=>{
            MockBinding.reset();
            MockBinding.createPort('COM1')

            bike = new Daum8i( {serial:SerialInterface.getInstance({ifaceName:'serial', binding:Daum8iMock}), path:'COM1' })
            bike.programUploadInit= jest.fn().mockReturnValue(true)
            //bike.programUploadStart= jest.fn()
            bike.programUploadSendBlock= jest.fn().mockResolvedValue(true)
            bike.programUploadDone= jest.fn().mockResolvedValue(true)
            bike.startProgram=jest.fn().mockResolvedValue(true)

        })

        afterEach( async ()=> {
        })


        const route:Route = {
            programId:1,
            points:[],
            type:'',
            lapMode:false,
            totalDistance:0
        }

        test('sucess - 1 data block only',async ()=>{
            const epp = new Uint8Array(Buffer.from('000000000000000000000000','hex'))
            bike.programUploadStart = jest.fn().mockResolvedValue( epp)

            const onStatusUpdate = jest.fn()
            const res = await bike.programUpload('race',route,onStatusUpdate)

            expect(res).toBeTruthy()
            expect(bike.programUploadInit).toHaveBeenCalled()
            expect(bike.programUploadStart).toHaveBeenCalled()
            expect(bike.programUploadSendBlock).toHaveBeenCalledTimes(1)
            expect(bike.programUploadDone).toHaveBeenCalled()
            expect(onStatusUpdate).toHaveBeenCalledTimes(2)
            expect(onStatusUpdate).toHaveBeenNthCalledWith(1,0,12)
            expect(onStatusUpdate).toHaveBeenNthCalledWith(2,12,12)
        }) 

        test('sucess - 10 blocks',async ()=>{
            const epp = new Uint8Array(Buffer.alloc(10*512-10))
            bike.programUploadStart = jest.fn().mockResolvedValue( epp)

            const onStatusUpdate = jest.fn()
            const res = await bike.programUpload('race',route,onStatusUpdate)

            expect(res).toBeTruthy()
            expect(bike.programUploadInit).toHaveBeenCalled()
            expect(bike.programUploadStart).toHaveBeenCalled()
            expect(bike.programUploadSendBlock).toHaveBeenCalledTimes(10)
            expect(bike.programUploadDone).toHaveBeenCalled()
            expect(onStatusUpdate).toHaveBeenCalledTimes(11)
            expect(onStatusUpdate).toHaveBeenNthCalledWith(1,0,5110)
            expect(onStatusUpdate).toHaveBeenLastCalledWith(5110,5110)
        }) 


        test('empty epp',async ()=>{
           
            bike.programUploadStart = jest.fn().mockResolvedValue( [])

            const onStatusUpdate = jest.fn()
            const res = await bike.programUpload('race',route,onStatusUpdate)

            expect(res).toBeTruthy()
            expect(bike.programUploadInit).toHaveBeenCalled()
            expect(bike.programUploadStart).toHaveBeenCalled()
            expect(bike.programUploadSendBlock).not.toHaveBeenCalledTimes(1)
            expect(bike.programUploadDone).toHaveBeenCalled()
            expect(onStatusUpdate).toHaveBeenCalledTimes(1)
            expect(onStatusUpdate).toHaveBeenNthCalledWith(1,0,0)
        }) 

        test('no epp',async ()=>{
           
            bike.programUploadStart = jest.fn().mockResolvedValue( undefined)

            const onStatusUpdate = jest.fn()
            const res = await bike.programUpload('race',route,onStatusUpdate)

            expect(res).toBeTruthy()
            expect(bike.programUploadInit).toHaveBeenCalled()
            expect(bike.programUploadStart).toHaveBeenCalled()
            expect(bike.programUploadSendBlock).not.toHaveBeenCalledTimes(1)
            expect(bike.programUploadDone).toHaveBeenCalled()
            expect(onStatusUpdate).toHaveBeenCalledTimes(1)
            expect(onStatusUpdate).toHaveBeenNthCalledWith(1,0,0)
        }) 

        test('error during communication',async ()=>{
            
            bike.programUploadStart = jest.fn().mockRejectedValue( new Error('ACK Timeout'))

            const onStatusUpdate = jest.fn()
            const res = await bike.programUpload('race',route,onStatusUpdate)

            expect(res).toBeFalsy()
            expect(onStatusUpdate).not.toHaveBeenCalled()
        }) 





    })

})