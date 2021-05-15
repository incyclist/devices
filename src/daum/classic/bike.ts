import IndoorBikeProcessor from '../indoorbike'
import {EventLogger} from 'gd-eventlog'
import {hexstr, getCockpit,getBikeType,getAge,getGender,getLength,getWeight,buildError,Float32ToIntArray, parseRunData} from './utils'
import {Queue} from '../../utils'
const ByteLength = require('@serialport/parser-byte-length')



const nop = ()=>{}
const TIMEOUT_START = 15000;
const TIMEOUT_CLOSE = 5000;    // 5s
const TIMEOUT_SEND  = 2000;    // 2s
var SerialPort = undefined;


type SuccessCallbackFn = (data: any) => void
type ErrorCallbackFn = (status:number,error: any) => void


interface CommandInstructions {
    logStr: string,
    payload: Array<number>,
    expected: number,
    callback: SuccessCallbackFn
    callbackErr: ErrorCallbackFn,
    options?: any
}


export default class Daum8008  {

    
    logger: EventLogger;

    portName: string;
    settings: any;
    bikeData: any;
    processor: any;
    sp: any;
    error: Error;
    firstOpen: boolean;
    opening: boolean;
    connected: boolean;
    closing: boolean;
    closed: boolean;
    cmdBusy: boolean;
    queue: Queue<CommandInstructions>
    bikeCmdWorker: any;
    cmdStart: number;
    cmdCurrent: any;

    constructor( opts={} as any ) {
        
        this.logger = new EventLogger('DaumClassic');

        this.portName = opts.port || process.env.COM_PORT
        this.settings = opts.settings || {};        


        this.bikeData = {
            userWeight:75,
            bikeWeight:10,
            maxPower: 800
        }
            
        this.processor = new IndoorBikeProcessor(this,{});

        this.sp = undefined;
        this.error = undefined;
        this.opening = false;
        this.connected = false;
        this.closing = false;
        this.closed = undefined;
        this.cmdBusy=false;
        this.queue = new Queue();        
    }

    static setSerialPort(spClass) {
        SerialPort= spClass;
    }

    static getClassName() {
        return "Daum8008"
    }

    getType() {
        return "DaumClassic";
    }

    getPort() {
        return this.portName;
    }

    isConnected() {
        return this.connected;
    }


    setUser(user, callback) {
        this.logger.logEvent({message:"setUser()",user});
        
        this.settings.user = user || {};

        var cb = callback||nop;
        cb(200,user)
    }

    getUserWeight() {
        //this.log("Daum8008: getUserWeight()");
        if (this.settings===undefined || this.settings===null || this.settings.user===undefined || this.settings.user===null)
            return getWeight(undefined);
        else
            return getWeight(this.settings.user.weight)-10;

    }

    getBikeWeight() {
        //this.log("Daum8008: getBikeWeight()");
        if ( this.settings.weight ) {
            let m = this.settings.weight;
            if (m>0 && m<20)
                return m;
        }
        return 10;
    }

  
    connect() {
        this.logger.logEvent({message:"connect()",port:this.getPort(), sp:(this.sp!==undefined),});
        if ( this.closing || this.opening) {
            return;
        }


        try {
            if ( this.sp===undefined ) {
                const settings = this.settings.port || {}
                settings.autoOpen=false;

                this.sp = new SerialPort( this.portName,settings);
                this.sp.on('open', ()=>{this.onPortOpen()} );            
                this.sp.on('close', ()=>{this.onPortClose()});            
                this.sp.on('error', (error)=>{this.onPortError(error)} );            
                this.firstOpen = true;
            }    
            else {                
                this.sp.open();
            }

            this.sp.open()
            this.cmdBusy=true;
            this.opening = true;
            this.closed = undefined;

        }
        catch (err)  {
            this.logger.logEvent({message:"startTraining:error:",error:err.message});
        }               

    }

    saveConnect() {
        return new Promise( (resolve,reject)=> {
            if ( this.isConnected() ) {
                this.opening = false;
                return resolve(true);
            }

            this.connect();
            const tTimeout = Date.now()+TIMEOUT_START;
            const iv = setInterval( ()=>{
                if ( this.isConnected() ) {
                    this.opening = false;
                    resolve(true);
                    clearInterval(iv);
                }
                else {
                    if ( this.error) {
                        reject(this.error)
                        clearInterval(iv);
                        return;
                    }
                    if ( Date.now()>tTimeout ) {
                        this.opening = false;
                        reject( new Error('timeout') );
                        clearInterval(iv);
                    }
                }
            } ,100)
        })
    }


    close() {
        this.logger.logEvent( {message:'close()', port:this.getPort()});
        if ( this.closing) {
            return;
        }

        var serialPort = this.sp;
        this.closing = true;
        if ( this.queue!==undefined )
            this.queue.clear();

        if (this.bikeCmdWorker!==undefined) {
            clearInterval(this.bikeCmdWorker);
            this.bikeCmdWorker=undefined;
        }

        let connected = this.connected ;
        if ( connected) {
            if( serialPort ) {
                serialPort.unpipe();
                serialPort.flush();    
                serialPort.drain( ()=> {
                    serialPort.close();
                })
            }
       
        }
        else {
            if (serialPort)
                serialPort.close()
        }
        this.cmdBusy=false;    

    }

    saveClose() {
        return new Promise( (resolve,reject)=> {
    
            this.close();
            const tTimeout = Date.now()+TIMEOUT_CLOSE;
            const iv = setInterval( ()=>{
                if ( !this.closing || this.closed) {
                    resolve(true);
                    clearInterval(iv);
                }
                else {
                    if ( this.sp)
                        this.sp.close()
                    if ( Date.now()>tTimeout ) {
                        this.closing = false;
                        reject( new Error('timeout') );
                        clearInterval(iv);
                    }
                }
            } ,100)
    
        })
    
    
    }

    onPortOpen() {
        this.logger.logEvent({message:"port opened",port:this.getPort()});
        this.error = undefined;
        this.connected = true;
        this.opening = false;
        this.closed = false;
        if ( this.cmdStart!==undefined) {
            this.cmdStart=Date.now();
        }
        if (this.firstOpen!==undefined) {
            this.firstOpen=undefined;
            //console.log("on('open'):cmdBusy=false");
        }
        this.cmdBusy=false;
    }

    onPortClose() {
        this.logger.logEvent( {message:"port closed",port:this.getPort()});
        
        this.error = undefined;
        this.connected = false;
        this.closing = false;
        this.closed = true;
        this.cmdBusy=false;

        if ( this.queue!==undefined )
            this.queue.clear();

    }

    onPortError(err) {
        if ( this.closed && !this.opening)
            return;
        if ( (this.closing || this.closed) && (err.message==='Port is not open' || err.message==='Writing to COM port (GetOverlappedResult): Operation aborted'))
            return;
        if ( this.opening && (err.message==='Port is already open' || err.message==='Port is opening'))
            return;

        const state = { opening:this.opening, connected:this.connected, closing:this.closing, closed:this.closed, busy:this.cmdBusy}
        this.logger.logEvent({message:"port error:",port:this.getPort(),error:err.message,stack:err.stack,state});
        this.error = err;
        this.cmdBusy=false;
    }


    /*
        Queue Handling & Sending
    */

    startWorker() {
        this.bikeCmdWorker = setInterval( ()=> {
            this.sendDaum8008CommandfromQueue()
        }, 50 );
    }

    sendDaum8008CommandfromQueue() {

        if (!this.connected  || this.closing)
            return;

        if (this.cmdStart!==undefined && this.error!==undefined) {

            if( this.cmdStart!==undefined ) {      
                const cmdInfo = this.cmdCurrent;
                var retry = 0;

                if ( cmdInfo.options!==undefined && cmdInfo.options.retries!==undefined) {
                    retry = this.cmdCurrent.options.retries;
                }

                if (cmdInfo.callbackErr!==undefined && retry===0) {
                    let cb = cmdInfo.callbackErr;
                    let error = this.error;
                    //console.log("maxretries:cmdBusy=false");
                    this.cmdBusy=false;
                    this.cmdCurrent=undefined;
                    this.cmdStart=undefined;
                    this.error = undefined;
                    return cb(500,{ message: error} )            
                }

            }
        }

        if ( this.connected && this.cmdBusy) { 
            if( this.cmdCurrent!==undefined  && this.cmdCurrent.start!==undefined) {      
                const cmdInfo = this.cmdCurrent;
                const timeout =  ( cmdInfo.options && cmdInfo.options.timeout) ? cmdInfo.options.timeout : TIMEOUT_SEND;

                let d = Date.now()-cmdInfo.start;
                if ( d>timeout) {
                    this.logger.logEvent( {message:'sendCommmand:timeout',port:this.getPort()}); 
                    const port = this.sp;
                    port.unpipe();
                    port.flush();

                    if (this.cmdCurrent.callbackErr!==undefined) {
                        let cb = this.cmdCurrent.callbackErr;
                        this.cmdBusy=false;
                        this.cmdCurrent=undefined;
                        this.cmdStart=undefined;
                        return cb(408,{ message: "timeout"} )            
                    }
                }
            }
            return;
        }
        else {
            //console.log( "connected"+bike.connected+",busy:" + bike.cmdBusy) 
        }

        if ( this.cmdBusy)
            return;

        if ( this.queue===undefined || this.queue.isEmpty()) {
            return;
        }

        const cmd = this.queue.dequeue()
        this.send(cmd);
    }

    sendDaum8008Command( logStr, payload, expected, callback?,callbackErr?, options?) {        
        let cmdInfo = {
            logStr,
            payload,
            expected,
            callback: callback || nop,
            callbackErr: callbackErr || nop,
            options: options
        }
        this.queue.enqueue(cmdInfo);
        //this.logger.logEvent({message:"sendCommand:adding:",cmd:logStr, hex:hexstr(payload),queueSize:this.queue.size()});

        if ( this.bikeCmdWorker===undefined) {
            this.startWorker();
        }
    }

    send(cmdInfo) {
        this.cmdBusy = true;
        this.cmdCurrent = cmdInfo;

        const {logStr,payload,expected,callback,callbackErr} = cmdInfo;
        const done = () => {
            this.cmdBusy=false;
            this.cmdCurrent=undefined;
            this.cmdStart=undefined;
        }


        try {
            const serialPort = this.sp;
            const parser = serialPort.pipe(new ByteLength({length: expected}))

            parser.on('data', (data) => {
                let duration = Date.now()-this.cmdStart;
                this.logger.logEvent({message:"sendCommand:received:",duration,hex:hexstr(data),port:this.getPort()});
                serialPort.unpipe();

                if (callbackErr!==undefined) {
                    if ( data[0]!==payload[0] ) {
                        serialPort.flush();
                        this.logger.logEvent( {message: "sendCommand:illegal response",port:this.getPort()});
                        done();
                        return callbackErr(512,{ message: "illegal response"} )            
                    }
                }
                callback(data);
                done();
            })


            this.logger.logEvent({message:"sendCommand:sending:",cmd:logStr, hex:hexstr(payload), port:this.getPort()});
            this.cmdCurrent.start = this.cmdStart = Date.now();
            serialPort.write( payload);

        }
        catch (err)  {
            this.logger.logEvent({message:"sendCommand:error:",error:err.message,port:this.getPort()});
            done();
            callbackErr(500,{ message: `Exception: ${err.message}`})

        }          
    
    }

    /*
    ====================================== Commands ==============================================
    */


    checkCockpit(bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `checkCockpit(${bikeNo})`,[0x10,bikeNo],3, 
                (data)          => resolve({bike : data[1], version: data[2]}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    getAddress() {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `getAddress()`,[0x11],2, 
                (data)          => resolve({bike : data[1]}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    getVersion(bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `getVersion(${bikeNo})`, [0x73,bikeNo],11,
                (data)          => resolve({bike : data[1], serialNo: hexstr(data,2,8), cockpit:getCockpit(data[10])}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    resetDevice(bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `resetDevice(${bikeNo})`,[0x12,bikeNo],2,
                (data)          => resolve({}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    startProg(bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `startProg(${bikeNo})`, [0x21,bikeNo],3,
                (data)          => resolve({bike : data[1], pedalling:data[2]>0}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    stopProg(bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `stopProg(${bikeNo})`,[0x22,bikeNo],3,
                (data)          => resolve({bike : data[1], pedalling:data[2]!==0}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    setProg(progNo=0,bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `setProg(${bikeNo},${progNo})`, [0x23,bikeNo,progNo],4,
                (data)          => resolve({bike:data[1],progNo:data[2],pedalling:data[3]!==0}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    setBikeType(bikeType,bikeNo=0) {
        const bikeVal = getBikeType( bikeType)        
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `setBikeType(${bikeNo},${bikeType})`, [0x69,bikeNo,0,0,bikeVal],3,
                (data)          => resolve({}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }


    setPerson(user={} as any,bikeNo=0) {
        const age = user.age!==undefined ? user.age : getAge(user.birthday) ;
        const gender = getGender( user.sex) ;    
        const length = getLength( user.length) ;  

        const mUser = user.weight || 80;
        const weight = getWeight( mUser)+10; // adding weight of bike    
        
        var cmd = [0x24,bikeNo,0];
        cmd.push( age );
        cmd.push( gender );    
        cmd.push( length );  
        cmd.push( weight  ); // adding weight of bike    
        cmd.push(0); // body fat
        cmd.push(0); // coaching: fitness
        cmd.push(3); // coaching: training freq
        cmd.push(800/5); // power Limit
        cmd.push(0); // hrm Limit
        cmd.push(0); // time Limit
        cmd.push(0); // dist Limit
        cmd.push(0); // calc Limit

        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `setPerson(${bikeNo},${age},${gender},${length},${weight})`,cmd,16, 
                (data)          => resolve({bike:data[1],age,gender,length,weight}),
                (status,err)    => reject(buildError(status,err))             
            );
        });

    }

    runData(bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `runData(${bikeNo})`,[0x40,bikeNo],19,
                (data)          => resolve(parseRunData(data)),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }


    setGear(gear,bikeNo=0) {
        let gearVal =gear;
        if (gear===undefined || gear<1) gearVal =1;
        if (gear>28) gearVal=28;

        return new Promise( (resolve,reject) => {            
            this.sendDaum8008Command(
                `setGear(${bikeNo},${gearVal})`,[0x53,bikeNo,gearVal],3,
                (data)          => resolve({bike:data[1],gear:data[2]}),
                (status,err)    => reject(buildError(status,err))             
            );
        });

    }

    setPower(power,bikeNo=0) {
        return new Promise( (resolve,reject) => {            
            if (power===undefined) {
                resolve({})
                return;
            }

            let powerRequest = power;
            if (power<25) powerRequest = 25;
            if (power>800) powerRequest = 800;
            const powerVal = Math.round(powerRequest/5);
    
            this.sendDaum8008Command(
                `setPower(${bikeNo},${power})`,[0x51,bikeNo,powerVal],3,
                (data)          => resolve({bike:data[1],power:(data[2]*5)}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

    setSlope(slope,bikeNo=0) {
        

        return new Promise( (resolve,reject) => {            
            if (slope===undefined) {
                resolve({})
                return;
            }

            const cmd = [0x55,bikeNo];
            const arr = Float32ToIntArray(slope);
            cmd.push( arr[3]);
            cmd.push( arr[2]);
            cmd.push( arr[1]);
            cmd.push( arr[0]);
        
            this.sendDaum8008Command(
                `setSlope(${bikeNo},${slope})`,cmd,6,
                (data)          => resolve({ bike: data[1], slope:slope}),
                (status,err)    => reject(buildError(status,err))             
            );
        });
    }

 }
