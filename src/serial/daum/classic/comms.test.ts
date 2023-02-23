import Bike from './comms'
import { EventLogger } from 'gd-eventlog';
import {DaumClassicMock, DaumClassicMockImpl, DaumClassicSimulator} from './mock'
import { MockBinding,  } from '@serialport/binding-mock';
import { SerialPortProvider,SerialInterface } from '../..';
import Daum8008 from './comms';

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

    describe( 'getClassName',()=> {
        expect(Bike.getClassName()).toEqual('Daum8008');

    })

    describe( 'getType',()=> {
        const bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
        expect(bike.getType()).toEqual('DaumClassic');

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
            
            DaumClassicMockImpl.getInstance().setSimulator('COM1',simulator)

            bike = new Daum8008( {serial:SerialInterface.getInstance({ifaceName:'serial'}), path:'COM1'})
            await bike.connect()
        })

        afterEach( async ()=> {
            await bike.close();
        })

        test('no arguments',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.checkCockpit() ;
            expect(bike.sendDaum8008Command).toBeCalledWith( "checkCockpit(0)", [0x10, 0],3, expect.anything(), expect.anything())
        })

        test('valid bike No',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.checkCockpit(1) ;
            expect(bike.sendDaum8008Command).toBeCalledWith( "checkCockpit(1)", [0x10, 1],3, expect.anything(), expect.anything())
        })


        test('correct response from bike',async ()=>{
            let res
            simulator.bikes[0].cockpitVersion = 1;
            simulator.bikes[1].cockpitVersion = 2;

            res = await  bike.checkCockpit(0) ;
            expect(res).toMatchObject({bike:0,version:1}) 

            res = await  bike.checkCockpit(1) ;
            expect(res).toMatchObject({bike:1,version:2}) 

        })

        test('no response from bike',async ()=>{
            
            let error;
            let res;
            
            simulator.simulateNoResponse(1)
            bike._timeoutSend = 50;
            try {
                res = await  bike.checkCockpit(1) ;
            }
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:1,version:undefined}) 
            expect(error).toBeUndefined()
        })

        test('late response from bike',async ()=>{
            
            let error;
            let res;
            
            simulator.simulateTimeout(200)
            bike._timeoutSend = 50;
            try {
                res = await  bike.checkCockpit(1) ;
            }
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:1,version:undefined}) 
            expect(error).toBeUndefined()
        })

    })



    describe( 'setPerson',()=> {

        let bike;
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
        })

        test('default user data',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.setPerson() ;
            // age: 30, gender: 2, length: 180, weight: 90, bodyFat:0, coachingLevel:0, coaching:3, powerLimit:0, hrmLimit: 0, timeLimit:0, distLimit:0, kcalLimit:0
            expect(bike.sendDaum8008Command).toBeCalledWith( "setPerson(0,30,2,180,90)", [0x24, 0, 0, 30, 2, 180, 90, 0, 0, 3, 160, 0, 0, 0, 0],16, expect.anything(), expect.anything())
        })

        test('user: 75kg, 170cm',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.setPerson({weight:75,length:170}) ;
            expect(bike.sendDaum8008Command).toBeCalledWith( "setPerson(0,30,2,170,85)", [0x24, 0, 0, 30, 2, 170, 85, 0, 0, 3, 160, 0, 0, 0, 0],16, expect.anything(), expect.anything())
        })

        test('correct response from bike - ',async ()=>{

            simulator.person = {weight:100, length:90, age:20}
            let res;
            res = await bike.setPerson({weight:75,length:170}) ;

            expect(res).toMatchObject({bike:0,age:30,gender:2,length:170,weight:85}) /* 75kk user weight + 10kg bike weight) */

        })


        test('no response from bike - ',async ()=>{

            let error;
            simulator.simulateNoResponse(1)
            bike._timeoutSend = 50;
            try {
                await bike.setPerson({weight:75,length:170}) ;
            }                
            catch (err) { error = err; }

            expect(error).toBeDefined()
            expect(error.message).toEqual('timeout')
        })

        test('illegal response from bike - ',async ()=>{

            let error;
            simulator.simulateIllegalResponse(1)
            bike._timeoutSend = 50;
            try {
                await bike.setPerson({weight:75,length:170}) ;
            }                
            catch (err) { error = err; }

            expect(error).toBeDefined()
            expect(error.message).toEqual('illegal response')
        })

    })

})