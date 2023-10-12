import { EventLogger } from 'gd-eventlog';
import {DaumClassicMock, DaumClassicMockImpl, DaumClassicSimulator} from './mock'
import { MockBinding,  } from '@serialport/binding-mock';
import { SerialPortProvider,SerialInterface } from '../..';
import Daum8008 from './comms';
import { ResponseTimeout } from '../premium/types';
import { Gender } from '../../../types/user';
import { DaumClassicResponse } from './types';
import { sleep } from '../../../utils/utils';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();


describe( 'bike',()=> {

    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )

        DaumClassicMockImpl.reset();        
        MockBinding.reset();

    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as any)

    })

    describe( 'constructor',()=> {
        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)
        })
    
    
        beforeEach( ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
        })
            
        test('serial with correct COM port',()=>{
            
            const bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            expect(bike.getPort()).toBe('COM1')    
        })

    })


    describe('doSend',()=>{
        let bike:Daum8008

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)
        })
    
    
        beforeEach( ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            
            bike.initForResponse = jest.fn()
            bike.write = jest.fn()
            bike.portFlush = jest.fn()
            bike.waitForResponse = jest.fn().mockResolvedValue( {type:'Response',data:[]})
            
        })
            
        test('error response',async ()=>{
            bike.waitForResponse = jest.fn().mockResolvedValue( {type:'Error',error:new Error('Some error')})
            await expect( async()=>{ await bike.doSend(2, new Uint8Array([0x1,0x2]) ) } )
                .rejects
                .toThrow('Some error')
        })

        test('illegal response',async ()=>{
            bike.waitForResponse = jest.fn().mockResolvedValue( {type:'Response',data:[0x9,0x10]})
            await expect( async()=>{ await bike.doSend(2, new Uint8Array([0x1,0x2]) ) } )
                .rejects
                .toThrow('illegal response')
        })
    })

    describe('send',()=>{
        let bike:Daum8008
        let bikeInt

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)
        })
    
    
        beforeEach( ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            bikeInt= bike as any;
            bike.logEvent = jest.fn()
            bike.isConnected = jest.fn().mockReturnValue(true)

        })
            
        test('successfull sending',async ()=>{
            const test:DaumClassicResponse = {type:'Response',data:new Uint8Array([0x1,0x2,0x3])}

            bike.doSend = jest.fn().mockResolvedValue(test)

            const res = await bike.send({logString:'test', command:[0x1, 0x2],expected:3})

            expect(res).toBe(test)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,{'cmd': 'test', 'message': 'sendCommand:sending:', 'port': 'COM1', 'hex': '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,{'cmd': 'test', 'message': 'sendCommand:received:', 'port': 'COM1', 'hex': '010203'})
            expect(bikeInt.sendCmdPromise).toBeNull()
        })

        test('error',async ()=>{
            bike.doSend = jest.fn().mockRejectedValue(new Error('Some Error'))

            await expect( async ()=> {await bike.send({logString:'test', command:[0x1, 0x2],expected:3})})
            .rejects
            .toThrow('Some Error')

            expect(bike.logEvent).toHaveBeenCalledTimes(2)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,{cmd: 'test', message: 'sendCommand:sending:', port: 'COM1', hex: '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({cmd: 'test', message: 'sendCommand:error:', port: 'COM1', error:'Some Error'}))
            expect(bikeInt.sendCmdPromise).toBeNull()
        })

        test('not connected with successfull reconnect',async ()=>{
            const test:DaumClassicResponse = {type:'Response',data:new Uint8Array([0x1,0x2,0x3])}
            bike.isConnected = jest.fn().mockReturnValueOnce(false)
            bike.connect = jest.fn().mockResolvedValue(true)
            bike.doSend = jest.fn().mockResolvedValue(test)

            const res = await bike.send({logString:'test', command:[0x1, 0x2],expected:3})

            expect(res).toBe(test)
            expect(bike.logEvent).toHaveBeenCalledTimes(2)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,{'cmd': 'test', 'message': 'sendCommand:sending:', 'port': 'COM1', 'hex': '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,{'cmd': 'test', 'message': 'sendCommand:received:', 'port': 'COM1', 'hex': '010203'})
            expect(bikeInt.sendCmdPromise).toBeNull()
        })

        test('not connected with failed reconnect',async ()=>{
            
            bike.isConnected = jest.fn().mockReturnValueOnce(false)
            bike.connect = jest.fn().mockResolvedValue(false)
            bike.doSend = jest.fn().mockResolvedValue(test)

            await expect( async ()=> {await bike.send({logString:'test', command:[0x1, 0x2],expected:3})})
            .rejects
            .toThrow('not connected')

            expect(bike.logEvent).toHaveBeenNthCalledWith(1,{'cmd': 'test', 'message': 'sendCommand:sending:', 'port': 'COM1', 'hex': '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({cmd: 'test', message: 'sendCommand:error:', port: 'COM1', error:'not connected'}))
            expect(bike.logEvent).toHaveBeenCalledTimes(2)
            expect(bikeInt.sendCmdPromise).toBeNull()
        })


        test('error',async ()=>{
            bike.doSend = jest.fn().mockRejectedValue(new Error('Some Error'))

            await expect( async ()=> {await bike.send({logString:'test', command:[0x1, 0x2],expected:3})})
            .rejects
            .toThrow('Some Error')

            expect(bike.logEvent).toHaveBeenCalledTimes(2)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,{cmd: 'test', message: 'sendCommand:sending:', port: 'COM1', hex: '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({cmd: 'test', message: 'sendCommand:error:', port: 'COM1', error:'Some Error'}))
            expect(bikeInt.sendCmdPromise).toBeNull()
        })



        test('duplicate requests',async ()=>{
            const test:DaumClassicResponse = {type:'Response',data:new Uint8Array([0x1,0x2,0x3])}
            bike.doSend = jest.fn( async ()=>{ await sleep(50); return test  })

            let res1, res2;
            const first = bike.send({logString:'test', command:[0x1, 0x2],expected:3}).then((res)=>{res1=res})
            await sleep(10)
            const second = bike.send({logString:'test', command:[0x1, 0x2],expected:3}).then((res)=>{res2=res})
            await Promise.all( [first,second])
          
            expect(res1).toBe(test)
            expect(res2).toBe(test)

            expect(bike.logEvent).toHaveBeenCalledTimes(5)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,{'cmd': 'test', 'message': 'sendCommand:sending:', 'port': 'COM1', 'hex': '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,{'cmd': 'test', 'message': 'sendCommand:waiting:', 'port': 'COM1'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(3,{'cmd': 'test', 'message': 'sendCommand:received:', 'port': 'COM1', 'hex': '010203'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(4,{'cmd': 'test', 'message': 'sendCommand:sending:', 'port': 'COM1', 'hex': '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(5,{'cmd': 'test', 'message': 'sendCommand:received:', 'port': 'COM1', 'hex': '010203'})

            expect(bikeInt.sendCmdPromise).toBeNull()
        })

        test('duplicate requests - busy timeout',async ()=>{
            const test:DaumClassicResponse = {type:'Response',data:new Uint8Array([0x1,0x2,0x3])}
            bike.doSend = jest.fn( async ()=>{ await sleep(150); return test  })
            bike.getBusyTimeout = jest.fn().mockReturnValue(50)

            const first = bike.send({logString:'test', command:[0x1, 0x2],expected:3})
            await sleep(10)
            const second = bike.send({logString:'test', command:[0x1, 0x2],expected:3})

            const res = await Promise.allSettled( [
                first,
                second
            ])

            console.log(JSON.stringify(res))
            expect(res[0]).toEqual( {status:'fulfilled',value:test})
            expect(res[1]).toMatchObject( {status:'rejected'})
            
                
            expect(bike.logEvent).toHaveBeenCalledTimes(4)
            expect(bike.logEvent).toHaveBeenNthCalledWith(1,{cmd: 'test', message: 'sendCommand:sending:', port: 'COM1', 'hex': '0102'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(2,{cmd: 'test', message: 'sendCommand:waiting:', port: 'COM1'})
            expect(bike.logEvent).toHaveBeenNthCalledWith(3, expect.objectContaining({cmd: 'test', message: 'sendCommand:error:', error: 'BUSY timeout', port: 'COM1'}))
            expect(bike.logEvent).toHaveBeenNthCalledWith(4,{cmd: 'test', message: 'sendCommand:received:', port: 'COM1', 'hex': '010203'})

            expect(bikeInt.sendCmdPromise).toBeNull()
        })


    })

    describe( 'checkCockpit',()=> {

        let bike;
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            simulator.bikes[0].cockpitVersion = 1;
            simulator.bikes[1].cockpitVersion = 2;
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('no arguments, uses 0 as default',async ()=>{
            const res = await bike.checkCockpit() ;
            expect(res).toMatchObject({bike:0,version:1}) 
        })

        test('valid bike No',async ()=>{
            const res = await bike.checkCockpit(1) ;
            expect(res).toMatchObject({bike:1,version:2}) 
        })


        test('correct response from bike',async ()=>{
            let res

            res = await  bike.checkCockpit(0) ;
            expect(res).toMatchObject({bike:0,version:1}) 

            res = await  bike.checkCockpit(1) ;
            expect(res).toMatchObject({bike:1,version:2}) 

        })

        test('no response from bike',async ()=>{
            
            let error;
            let res;
            
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)
            
            try {
                res = await  bike.checkCockpit(1) ;
            }
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:1,version:undefined}) 
            expect(error).toBeUndefined()
        })

        test('error response from bike',async ()=>{
           
            bike.send = jest.fn().mockRejectedValue( new Error('Some Error'))
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)
            await expect(async ()=> { await  bike.checkCockpit(1) }).rejects.toThrow('Some Error')
        })

        test('timeout error response from bike',async ()=>{
           
            bike.send = jest.fn().mockRejectedValue( new ResponseTimeout())
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)
            await expect(async ()=> { await  bike.checkCockpit(1) }).resolves
        })

        test('late response from bike',async ()=>{
            
            let error;
            let res;
            
            simulator.simulateTimeout(200)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            try {
                res = await  bike.checkCockpit(1) ;
            }
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:1,version:undefined}) 
            expect(error).toBeUndefined()
        })

    })

    describe( 'getAddress',()=> {

        let bike;
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            simulator.bikes[0].cockpitVersion = 1;
            simulator.bikes[1].cockpitVersion = 2;
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('bike responds with bike 0',async ()=>{
            simulator.selectedBike = 0;
            const res = await bike.getAddress() ;
            expect(res).toMatchObject({bike:0}) 
        })
        test('bike responds with bike 1',async ()=>{
            simulator.selectedBike = 1;
            const res = await bike.getAddress() ;
            expect(res).toMatchObject({bike:1}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.getAddress()})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

    describe( 'getVersion',()=> {

        let bike;
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            simulator.bikes[0].cockpitVersion = 1;
            simulator.bikes[1].cockpitVersion = 2;
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('bike responds with bike 0',async ()=>{
            simulator.selectedBike = 0;
            simulator.bikes[0].serialNo = '0102030405060708'
            simulator.bikes[0].cockpitType =50

           
            const res = await bike.getVersion(0) ;
            expect(res).toMatchObject({bike:0,serialNo:'0102030405060708', cockpit:'8080'}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.getAddress()})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })


    describe( 'setPerson',()=> {

        let bike:Daum8008;
        let simulator;


        beforeEach( async ()=> {
            jest.useRealTimers();

            MockBinding.reset();
            MockBinding.createPort('COM1');

            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)

            simulator = new DaumClassicSimulator();            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('no user',async ()=>{
            const res = await bike.setPerson() ;
            expect(res).toMatchObject({bike:0,age:30,gender:2,length:180,weight:90}) /* 10kg bike weight) */
        })

        test('user: 75kg, 170cm with using default for gender, bike, age',async ()=>{
            const res = await bike.setPerson({weight:75,length:170}) ;
            expect(res).toMatchObject({bike:0,age:30,gender:2,length:170,weight:85}) /* 10kg bike weight) */
        })

        test('user: 85kg, 160cm, 31y, female',async ()=>{
            const res = await bike.setPerson({weight:85,length:160,age:31,sex:Gender.FEMALE}) ;
            expect(res).toMatchObject({bike:0,age:31,gender:1,length:160,weight:95}) /* 10kg bike weight) */
        })
        test('user: 100kg, 190cm, 60y, male',async ()=>{
            const res = await bike.setPerson({weight:100,length:190,age:60,sex:Gender.MALE},1) ;
            expect(res).toMatchObject({bike:1,age:60,gender:0,length:190,weight:110}) /* 10kg bike weight) */
        })

        test('correct response from bike - ',async ()=>{

            let res;
            res = await bike.setPerson({weight:75,length:170}) ;

            expect(res).toMatchObject({bike:0,age:30,gender:2,length:170,weight:85}) /* 75kk user weight + 10kg bike weight) */

        })


        test('no response from bike - ',async ()=>{
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.setPerson({weight:75,length:170})})
            .rejects
            .toThrow(ResponseTimeout)
        })

        test('illegal response from bike - ',async ()=>{
            simulator.simulateIllegalResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)


            await expect( async ()=>{ await bike.setPerson({weight:75,length:170})})
            .rejects
            .toThrow('illegal response')
        })

    })



    describe( 'resetDevice',()=> {

        let bike;
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            simulator.bikes[0].cockpitVersion = 1;
            simulator.bikes[1].cockpitVersion = 2;
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('bike not provided',async ()=>{
            const res = await bike.resetDevice() ;
            expect(res).toMatchObject({bike:0}) 
        })
        test('bike  1',async ()=>{
            simulator.selectedBike = 1;
            const res = await bike.resetDevice(1) ;
            expect(res).toMatchObject({bike:1}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.resetDevice(0)})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

    describe( 'startProg',()=> {

        let bike:Daum8008
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('bike not provided',async ()=>{
            const res = await bike.startProg() ;
            expect(res).toMatchObject({bike:0,pedalling:false}) 
        })
        test('bike  1',async ()=>{
            const res = await bike.startProg(1) ;
            expect(res).toMatchObject({bike:1,pedalling:false}) 
        })

        test('bike  1 - already pedalling',async ()=>{
            simulator.isPedalling = jest.fn().mockReturnValue(true);
            const res = await bike.startProg(1) ;
            expect(res).toMatchObject({bike:1,pedalling:true}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.startProg(1)})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

    describe( 'stopProg',()=> {

        let bike:Daum8008
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('bike not provided',async ()=>{
            const res = await bike.stopProg() ;
            expect(res).toMatchObject({bike:0,pedalling:false}) 
        })
        test('bike  1',async ()=>{
            const res = await bike.stopProg(1) ;
            expect(res).toMatchObject({bike:1,pedalling:false}) 
        })

        test('bike  1 - already pedalling',async ()=>{
            simulator.isPedalling = jest.fn().mockReturnValue(true);
            const res = await bike.stopProg(1) ;
            expect(res).toMatchObject({bike:1,pedalling:true}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.stopProg(1)})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

    describe( 'setProg',()=> {

        let bike:Daum8008
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('default',async ()=>{
            const res = await bike.setProg() ;
            expect(res).toMatchObject({bike:0,progNo:0, pedalling:false}) 
        })
        test('bike  1 without progNo',async ()=>{
            const res = await bike.setProg(undefined,1) ;
            expect(res).toMatchObject({bike:1,progNo:0, pedalling:false}) 
        })
        test('bike  1 with progNo',async ()=>{
            const res = await bike.setProg(9,1) ;
            expect(res).toMatchObject({bike:1,progNo:9, pedalling:false}) 
        })

        test('bike  1 - already pedalling',async ()=>{
            simulator.isPedalling = jest.fn().mockReturnValue(true);
            const res = await bike.setProg(5,1) ;
            expect(res).toMatchObject({bike:1,progNo:5,pedalling:true}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.setProg(4,1)})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

    describe( 'setPower',()=> {

        let bike:Daum8008
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()            
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()
        })

        test('no bike',async ()=>{
            const res = await bike.setPower(100) ;
            expect(res).toMatchObject({bike:0,power:100}) 
        })
        test('bike  1',async ()=>{
            const res = await bike.setPower(100,1) ;
            expect(res).toMatchObject({bike:1,power:100}) 
        })

        test('below min(25)',async ()=>{
            const res = await bike.setPower(0,1) ;
            expect(res).toMatchObject({bike:1,power:25}) 
        })

        test('above max(800)',async ()=>{
            const res = await bike.setPower(1000,1) ;
            expect(res).toMatchObject({bike:1,power:800}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.setPower(40,1)})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

    describe( 'setGear',()=> {

        let bike:Daum8008
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('no bike',async ()=>{
            const res = await bike.setGear(10) ;
            expect(res).toMatchObject({bike:0,gear:10}) 
        })
        test('bike  1',async ()=>{
            const res = await bike.setGear(10,1) ;
            expect(res).toMatchObject({bike:1,gear:10}) 
        })

        test('below min(1)',async ()=>{
            const res = await bike.setGear(0,1) ;
            expect(res).toMatchObject({bike:1,gear:1}) 
        })

        test('above max(28)',async ()=>{
            const res = await bike.setGear(1000,1) ;
            expect(res).toMatchObject({bike:1,gear:28}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.setGear(20,1)})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

    describe( 'setSlope',()=> {

        let bike:Daum8008
        let simulator;

        beforeAll( ()=> {
            (SerialPortProvider as any)._instance = undefined
            SerialPortProvider.getInstance().setBinding('serial', DaumClassicMock)
        })

        beforeEach( async ()=> {
            jest.useRealTimers()
            MockBinding.reset();
            MockBinding.createPort('COM1')
            simulator = new DaumClassicSimulator();
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
            simulator.cleanup()

        })

        test('no bike',async ()=>{
            const res = await bike.setSlope(0) ;
            expect(res).toMatchObject({bike:0,slope:0}) 
        })
        test('bike  1',async ()=>{
            const res = await bike.setSlope(1.2,1) ;
            expect(res).toMatchObject({bike:1,slope:1.2}) 
        })

        test('no response from bike',async ()=>{           
            simulator.simulateNoResponse(1)
            bike.getTimeoutValue = jest.fn().mockReturnValue(50)

            await expect( async ()=>{ await bike.setSlope(10,1)})
            .rejects
            .toThrow(ResponseTimeout)
        })

    })

})