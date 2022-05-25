import { EventLogger } from 'gd-eventlog';
import {Daum8iSerial} from './bike'
import {ACTUAL_BIKE_TYPE} from '../constants'
import {asciiArrayToString, buildMessage,getAsciiArrayFromStr,hexstr,append} from './utils'

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

var __responses = {} as any;

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

    removeAllListeners() {
        this.callbacks = {}
    }

    emit(event, ...args) {
        if ( this.callbacks[event])
            this.callbacks[event](...args)
    }

    write( message) {

        if ( message[0]===1) {
            const cmdArr = [message[1],message[2],message[3]]
            const cmd = asciiArrayToString(cmdArr);
            const handler = MockSerialPort.getReponseHandler(cmd);
            if (handler)
                handler( message, (data)=> {
                    this.outputQueue.push(data);
                });
            else {
                console.log( 'server:no handler')
            }

        }
    }

    sendNext() {
        
        const onData = this.callbacks['data'];

        if ( onData && this.outputQueue && this.outputQueue.length>0) {
            const message = this.outputQueue.shift();

            console.log( 'server:sending',hexstr(message))
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
    }

}



describe( 'Daum8i', ()=> {
    let Daum8i = Daum8iSerial;

    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)

    })

    beforeEach( ()=> {
        MockSerialPort.reset();
        (MockSerialPort as any).list = ()=> { return new Promise( resolve=> resolve([ {path:'COM1'}])) }
        Daum8i.setSerialPort( MockSerialPort);
    })

    

    describe( 'functions', ()=> {

        let bike;

        beforeEach( async ()=>{
            bike = new Daum8i( {port:'COM1'})
            try {
                await bike.saveConnect();
            }
            catch (err) {
                if (process.env.DEBUG)
                    console.log(err.message, err.stack)
            }
        })

        afterEach( async ()=> {
            await bike.saveClose();
        })

        test('getProtocolVersion',async ()=> {
        
            MockSerialPort.setResponse( 'V00' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'V00', getAsciiArrayFromStr('201') ) ) } )            

        
            const version1 = await bike.getProtocolVersion();
            const version2 = await bike.getProtocolVersion();
            
            expect(version1).toBe('2.01');
            expect(version2).toBe('2.01');
        })
    
        test('getDashboardVersion',async ()=> {
            
            MockSerialPort.setResponse( 'V70' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'V70', getAsciiArrayFromStr('Version 1.380') ) ) } )
            let version;

            await bike.getDashboardVersion();
            version = await bike.getDashboardVersion();
            expect(version).toBe('Version 1.380');
        })
    
        describe('getDeviceType',()=> {
    
            test('run',async ()=> {
                MockSerialPort.setResponse( 'Y00' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'Y00', getAsciiArrayFromStr('0') ))})
                const deviceType = await bike.getDeviceType()
                expect(deviceType).toBe('run');    
            })
    
            test('bike',async ()=> {
                MockSerialPort.setResponse( 'Y00' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'Y00', getAsciiArrayFromStr('2') ))})
                const deviceType = await bike.getDeviceType()
                expect(deviceType).toBe('bike');
            })
    
            test('lyps',async ()=> {
                MockSerialPort.setResponse( 'Y00' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'Y00', getAsciiArrayFromStr('7') ))})
                const deviceType = await bike.getDeviceType()
                expect(deviceType).toBe('lyps');
            })
    
    
            test('unknown value',async ()=> {
                MockSerialPort.setResponse( 'Y00' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'Y00', [5] ))})
                let error;
                try {
                    await bike.getDeviceType()
                }
                catch(err) { error=err}
                expect(error.message).toBe('unknown device type 5');
            })
    
    
        })
    
    
        describe('getActualDeviceType',()=> {
                
            test('allround',async ()=> {
                MockSerialPort.setResponse( 'M72' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'M72', '0' ))})
                const deviceType = await bike.getActualBikeType()
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.ALLROUND);    
            })
    
            test('bike',async ()=> {
                MockSerialPort.setResponse( 'M72' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'M72', '1' ))})
                const deviceType = await bike.getActualBikeType()
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.RACE);
            })
    
            test('lyps',async ()=> {
                MockSerialPort.setResponse( 'M72' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'Y00', '2' ))})
                const deviceType = await bike.getActualBikeType()
                expect(deviceType).toBe(ACTUAL_BIKE_TYPE.MOUNTAIN);
            })
    
    
            test('unknown numeric value',async ()=> {
                MockSerialPort.setResponse( 'M72' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'Y00', 5 ))})
                let error;
                try {
                    await bike.getActualBikeType()
                }
                catch(err) { error=err}
                expect(error.message).toBe('unknown actual device type 5');
            })
    
            test('unknown string value',async ()=> {
                MockSerialPort.setResponse( 'M72' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage( 'Y00', '5' ))})
                let error;
                try {
                    await bike.getActualBikeType()
                }
                catch(err) { error=err}
                expect(error.message).toBe(`unknown actual device type 53`);
            })
    
            test('ACK timeout',async ()=> {
                bike.settings.serial = {timeout:200};
                MockSerialPort.setResponse( 'M72' , ( command, sendData) => { })

                const call = () => {                    
                    const res = bike.getActualBikeType();
                    return res;

                }
    
                let error;
                try {
                    await call();
                }
                catch(err) { error=err}
                expect(error.message).toBe('ACK timeout');
            },10000)

            test('response timeout',async ()=> {
                bike.settings.serial = {timeout:200};
                bike.sendRetryDelay = 100;
                MockSerialPort.setResponse( 'M72' , ( command, sendData) => { sendData( [0x06]); })

                const call = () => {                    
                    const res = bike.getActualBikeType();
                    return res;

                }
    
                let error;
                try {
                    await call();
                }
                catch(err) { error=err}

                // TODO: verify that command was retried 3 times
                expect(error.message).toBe('RESP timeout');
            },1000)


            test('response timeout - no ACK',async ()=> {
                bike.settings.serial = {timeout:200};
                bike.sendRetryDelay = 100;

                const call = () => {                    
                    const res = bike.getActualBikeType();
                    return res;

                }
    
                let error;
                try {
                    await call();
                }
                catch(err) { error=err}

                // TODO: verify that command was retried 3 times
                expect(error.message).toBe('ACK timeout');
            },1000)


        })

        test('setGear',async ()=> {
            MockSerialPort.setResponse( 'M71' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage('M71','12') ) } )
            const gear = await bike.setGear(11)
            expect(gear).toBe(11);    
        })

        test('getGear',async ()=> {
            
            // mock always return 10, regardless which gear was sent
            MockSerialPort.setResponse( 'M71' , ( command, sendData) => { sendData( [0x06]); sendData(  buildMessage( 'M71','10') ) } )

            const gear = await bike.getGear()
            expect(gear).toBe(10);
        })


        test('setPower',async ()=> {
            MockSerialPort.setResponse( 'S23' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage('S23','120') ) } )
            const power = await bike.setPower(120)
            expect(power).toBe(120);    
        })

        test('setPerson',async ()=> {
            MockSerialPort.setResponse( 'M70' , ( command, sendData) => { sendData( [0x06]); sendData( buildMessage('M70',[0x07,0x00,0x00,0x00]) ) } )
            const res = await bike.setPerson({weight:88.5,length:181})
            expect(res).toBeTruthy()
        })

        test('no response = ACK timeout',async ()=> {
        
            MockSerialPort.setResponse( 'V00' , ( command, sendData) => { })            

            bike.sendNAK = jest.fn()
            bike.getTimeoutValue = jest.fn(()=>100)     // TIMEOUT after 100ms

            let error = undefined;
            try {
                const res = await bike.getProtocolVersion();
                console.log(res)
            }
            catch (err) { error = err}
            
            expect(error.message).toBe('ACK timeout'); // as simulated server is not sending an ACK
        })

        test('illegal response',async ()=> {
        
            MockSerialPort.setResponse( 'V00' , ( command, sendData) => { 
                sendData( [0x06]); 
                const data = [0x31,0x32,0x20,0x10] 
                data.push(0x17);
                sendData( data)

            })            
            bike.sendNAK = jest.fn()
            bike.settings= { tcpip:{timeout:100}};
            let error = undefined;
            try {
                const res = await bike.getProtocolVersion();
                console.log(res)
            }
            catch (err) { error = err}
            expect(bike.sendNAK).toBeCalled();
            expect(error.message).toBe('RESP timeout'); // as simulated server is not sending the correct response
        })


        test('illegal response, followed by correction',async ()=> {
        
            MockSerialPort.setResponse( 'V00' , ( command, sendData) => { 
                sendData( [0x06]); 
                const data = [0x31,0x32,0x20,0x10] 
                data.push(0x17);
                sendData( data)
                sendData( buildMessage( 'V00201' ));
            })            
            bike.sendNAK = jest.fn()
            let error = undefined;
            let res;
            try {
                res = await bike.getProtocolVersion();
                console.log(res)
            }
            catch (err) { error = err}
            expect(bike.sendNAK).toBeCalled();
            expect(error).toBeUndefined();
            expect(res).toBe('2.01')
        })


        test('reponse sent together with ACK',async ()=> {
            /*MockSerialPort.setResponse( 'Y00' , ( command, sendData) => { 
                /sendData( [0x06]); sendData( buildMessage( 'Y000' ))
            })*/

            MockSerialPort.setResponse( 'Y00' , ( command, sendData) => { 
                const data = [0x06];
                data.push( ...buildMessage( 'Y000' ))                
                sendData( data)
            })
            const deviceType1 = await bike.getDeviceType()
            const deviceType2 = await bike.getDeviceType()
            expect(deviceType1).toBe('run');    
            expect(deviceType2).toBe('run');    
        })

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


    
    })


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

                const GS = 0x1D
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


})