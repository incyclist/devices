import Bike from './bike'
import { EventLogger } from 'gd-eventlog';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

var __responses = {} as any;
var __openTimeout : number = 0;

class MockSerialPort {

    callbacks: any;
    isOpen: boolean;
    path: string;
    outputQueue: Array<any>
    iv: any;

    constructor() {
        this.callbacks= {}
        this.isOpen = false;
        this.path = undefined;

        this.outputQueue =  [];
        this.flush =  jest.fn();
        this.iv = undefined;

    }

    flush() {
        this.outputQueue=[];
    }
    
    open() {
        if ( __openTimeout ) { return setTimeout( ()=> {this._open()}, __openTimeout) }

        this._open();
    }
    _open() {
        if ( __openTimeout ) {}
        this.isOpen = true;
        this.iv = setInterval( ()=> {this.sendNext()},10 )
        this.emit('open')
    }

    close() {
        
        this.isOpen = false;
        this.outputQueue=[];
        if ( this.iv) {
            clearInterval(this.iv)
            this.iv = undefined;
        }
        this.emit('close')
    }


    on(event,callback) {
        this.callbacks[event]=callback;
    }

    emit(event, ...args) {
        if ( this.callbacks[event])
            this.callbacks[event](...args)
    }

    write( message) {
        const cmd = message[0];
        const handler = MockSerialPort.getReponseHandler(cmd);
        if (handler)
            handler( message, (data)=> {
                this.outputQueue.push(data);
            });
        else {
            console.log( 'server:no handler')
        }
    }

    sendNext() {
        
        const onData = this.callbacks ? this.callbacks['data'] : undefined;

        if ( onData && this.outputQueue && this.outputQueue.length>0) {
            const message = this.outputQueue.shift();

            //console.log( 'server:sending',hexstr(message))
            onData(message);
        }
        else {
            if ( onData ===  undefined)
                console.log( 'server:onData not defined')

        }

    }

    unpipe() {
        delete this.callbacks['data'];
    }

    
    pipe( transformer) {

        return this;
    }

    static setOpenTimeout( timeout ) { __openTimeout = timeout }

    static setResponse( command, fn ) {
        if (!__responses) 
            this.reset();
        __responses[command] = fn;
    }

    static getReponseHandler(command) {
        return __responses[command];
    }

    static reset() {
        __responses = {};
        __openTimeout = 0;
    }

}


describe( 'bike',()=> {

    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)

    })


    describe( 'constructor',()=> {
        let originalEnv ;
        beforeEach(()=> {
            originalEnv = process.env 
        })
        afterEach(()=> {
            process.env = originalEnv;
        })

        it( 'default parameters',()=> {
            process.env.COM_PORT = 'COMX';

            const bike = new Bike( )
            expect(bike.portName).toEqual('COMX');
            expect(bike.settings).toMatchObject({});
            expect(bike.logger).toBeDefined();
            expect(bike.bikeData).toMatchObject({
                userWeight:75,
                bikeWeight:10,
                maxPower: 800
            })
        })

        it( 'with port',()=> {
            process.env.COM_PORT = 'COMX';

            const bike = new Bike( {port:'COM1'} )
            expect(bike.portName).toEqual('COM1');
            expect(bike.settings).toMatchObject({});
            expect(bike.logger).toBeDefined();
            expect(bike.bikeData).toMatchObject({
                userWeight:75,
                bikeWeight:10,
                maxPower: 800
            })
        })

        it( 'with settings',()=> {
            process.env.COM_PORT = 'COMX';

            const bike = new Bike( {settings:{ weight:15, user:{age:50, weight:75, length:180}}} )
            expect(bike.portName).toEqual('COMX');
            expect(bike.settings).toMatchObject({weight:15, user:{age:50, weight:75, length:180}});
            expect(bike.logger).toBeDefined();
            expect(bike.bikeData).toMatchObject({
                userWeight:75,
                bikeWeight:10,
                maxPower: 800
            })
        })

    })

    describe( 'getClassName',()=> {
        expect(Bike.getClassName()).toEqual('Daum8008');

    })

    describe( 'getType',()=> {
        const bike = new Bike( )
        expect(bike.getType()).toEqual('DaumClassic');

    })

    describe( 'checkCockpit',()=> {

        let bike;
        beforeEach( ()=> {
            MockSerialPort.reset();    
            (MockSerialPort as any).list = ()=> { return new Promise( resolve=> resolve([ {path:'COM1'}])) }
            Bike.setSerialPort( MockSerialPort);
            bike = new Bike();   
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


        test('correct response from bike - ',async ()=>{
            MockSerialPort.setResponse( 0x10, ( _command: any, sendData: (msg: number[]) => void) => { sendData([0x10, 0, 1]) } )

            let error;
            let res;
            await bike.saveConnect();
            try {
                res = await  bike.checkCockpit(0) ;
            }
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:0,version:1}) 
            expect(error).toBeUndefined()

        })

        test('no response from bike - ',async ()=>{

            let error;
            let res;
            await bike.saveConnect();
            bike.settings.timeoutMessage = 10;  // set timeout to 10ms, so that test execution does not take unnecessarily long
            try {
                res = await  bike.checkCockpit(1) ;
            }
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:1,version:undefined}) 
            expect(error).toBeUndefined()
        })

    })



    describe( 'connect',()=> {

        let openFn;

        beforeEach( ()=> {
            MockSerialPort.reset();    
            (MockSerialPort as any).list = ()=> { return new Promise( resolve=> resolve([ {path:'COM1'}])) }
            Bike.setSerialPort( MockSerialPort);
        })
    
        it( 'port can be opened',async ()=> { 
            const bike = new Bike( {port:'COM1'} )
            const res = await bike.saveConnect();
            expect(res).toBe(true);
            expect(bike.connected).toBeTruthy();
            expect(bike.opening).toBeFalsy();
            expect(bike.cmdBusy).toBeFalsy();
        })
    
        it( 'states while opening',async ()=> { 
            MockSerialPort.setOpenTimeout(3000);

            const bike = new Bike( {port:'COM1'} )
            const res = bike.saveConnect();
            expect(bike.connected).toBeFalsy();
            expect(bike.opening).toBeTruthy();
            expect(bike.cmdBusy).toBeTruthy();
        })

        it( 'timeout',async ()=> { 
            MockSerialPort.setOpenTimeout(3000);

            let error;
            const bike = new Bike( {port:'COM1',settings:{timeoutStart:10}} )
            try {
                await bike.saveConnect();
            }
            catch (err) { error = err };

            expect(error).toBeDefined();
            expect(bike.connected).toBeFalsy();
            expect(bike.opening).toBeFalsy();
            expect(bike.cmdBusy).toBeFalsy();
        })



    })

    describe( 'setPerson',()=> {

        let bike;
        beforeEach( ()=> {
            MockSerialPort.reset();    
            (MockSerialPort as any).list = ()=> { return new Promise( resolve=> resolve([ {path:'COM1'}])) }
            Bike.setSerialPort( MockSerialPort);
            bike = new Bike();   
        })

        test('default user data',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.settings.maxPower = 0;
            bike.setPerson() ;
            // age: 30, gender: 2, length: 180, weight: 90, bodyFat:0, coachingLevel:0, coaching:3, powerLimit:0, hrmLimit: 0, timeLimit:0, distLimit:0, kcalLimit:0
            expect(bike.sendDaum8008Command).toBeCalledWith( "setPerson(0,30,2,180,90)", [0x24, 0, 0, 30, 2, 180, 90, 0, 0, 3, 0, 0, 0, 0, 0],16, expect.anything(), expect.anything())
        })

        test('user: 75kg, 170cm',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.settings.maxPower = 0;
            bike.setPerson({weight:75,length:170}) ;
            expect(bike.sendDaum8008Command).toBeCalledWith( "setPerson(0,30,2,170,85)", [0x24, 0, 0, 30, 2, 170, 85, 0, 0, 3, 0, 0, 0, 0, 0],16, expect.anything(), expect.anything())
        })

        test('correct response from bike - ',async ()=>{
            MockSerialPort.setResponse( 0x24, ( _command: any, sendData: (msg: number[]) => void) => { sendData([0x24, 0, 0, 30, 2, 170, 85, 0, 0, 3, 0, 0, 0, 0, 0]) } )

            let error;
            let res;
            await bike.saveConnect();
            try {
                res = await bike.setPerson({weight:75,length:170}) ;
            }                
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:0,age:30,gender:2,length:170,weight:85}) /* 75kk user weight + 10kg bike weight) */
            expect(error).toBeUndefined()

        })

        test('correct response from bike, but maxPower reduced to 400 - ',async ()=>{
            MockSerialPort.setResponse( 0x24, ( _command: any, sendData: (msg: number[]) => void) => { sendData([0x24, 0, 0, 30, 2, 170, 85, 0, 0, 3, 80, 0, 0, 0, 0]) } )

            let error;
            let res;
            await bike.saveConnect();
            try {
                res = await bike.setPerson({weight:75,length:170}) ;
            }                
            catch (err) { error = err; }

            expect(res).toMatchObject({bike:0,age:30,gender:2,length:170,weight:85}) /* 75kk user weight + 10kg bike weight) */
            expect(error).toBeUndefined()

        })

        test('incorrect response from bike - ',async ()=>{
            MockSerialPort.setResponse( 0x24, ( _command:any, sendData: (msg: number[]) => void) => { sendData([0x24, 0, 0, 30, 2, 170, 85, 0, 0, 3, 32, 0, 0, 0, 0]) } )

            let error;
            let res;
            await bike.saveConnect();
            try {
                res = await bike.setPerson({weight:75,length:170}) ;
            }                
            catch (err) { error = err; }

            expect(error).toBeDefined()
            expect(error.message).toEqual('illegal response')
        })

    })

})