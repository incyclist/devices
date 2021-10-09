import IndoorBikeProcessor from '../indoorbike'
import {ACTUAL_BIKE_TYPE,BIKE_INTERFACE} from "../constants"
import TcpSocketPort from './tcpserial'
import {buildMessage,hexstr,ascii,getReservedCommandKey,
       Int16ToIntArray, append,bin2esc, esc2bin,parseTrainingData, checkSum, getAsciiArrayFromStr} from './utils'

import {Queue, sleep} from '../../utils';


import {EventLogger} from 'gd-eventlog'

const nop = ()=>{}
const MAX_RETRIES = 5;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_SEND_DELAY = 1000;
const OPEN_RETRY_DELAY = 3000;
const CLOSE_RETRY_TIMEOUT = 5000;
const TIMEOUT_START = 15000;

const DAUM_PREMIUM_DEFAULT_PORT= 51955;
const DAUM_PREMIUM_DEFAULT_HOST= '127.0.0.1';

var __SerialPort = undefined;
var net = undefined;



class Daum8i  {
    portName: string;
    logger: EventLogger;
    serial: boolean;
    tcpip: boolean;
    tcpipConnection: { host:string, port:string}
    port: string;
    settings: any;
    sendRetryDelay: number;
    sp: any;

    connected: boolean;
    blocked: boolean;
    state: any;
    bikeData: any;
    processor: any;
    error: Error;
    queue: Queue<any>
    cmdWorker: any;
    cmdCurrent: any;
    cmdStart: number;

    /*
    ====================================== Comstructor ==============================================
    */
    constructor( props) {

        
        const opts = props || {}
        this.logger = props.logger || new EventLogger('DaumPremium') ;
        this.logger.logEvent( {message:'new DaumPremium object',opts})

        if (opts.interface==='tcpip') {
            const port = opts.port || DAUM_PREMIUM_DEFAULT_PORT;
            const host = opts.host || DAUM_PREMIUM_DEFAULT_HOST;
            this.portName = `${host}:${port}`;
            this.tcpip = true;
            this.serial = false;
            this.tcpipConnection = {host,port};
        }
        else {
            this.portName = opts.port || process.env.COM_PORT
            this.tcpip = false;
            this.serial = true;
            this.port = this.portName
        }


        this.settings = opts.settings || {};        
        this.settings.logger  = this.logger;

        this.sendRetryDelay = DEFAULT_SEND_DELAY;

        this.sp = undefined;
        this.connected = false;        

        this.blocked = false;
        this.state = {
            ack: { wait:false, startWait: undefined},
            commandsInQueue: {},
        }

        this.bikeData = {
            userWeight:75,
            bikeWeight:10,
            maxPower: 800
        }
        
        this.processor = new IndoorBikeProcessor(this);

        
    }
    /*
    ====================================== Statics ==============================================
    */
    static getClassName() {
        return "Daum8i"
    }

    getType() {
        return "Daum8i";
    }

    static setSerialPort(spClass) {
        __SerialPort= spClass;
    }

    static setNetImpl(netClass) {
        net= netClass;
    }

    static getSupportedInterfaces() {
        return [ BIKE_INTERFACE.SERIAL, BIKE_INTERFACE.TCPIP]
    }

    getPort() {
        return this.portName;
    }

    isConnected() {
        return this.connected;
    }

    /*
    ====================================== Bike Interface Implementation ==============================================
    */

   
    setUser(user, callback) {
        this.logger.logEvent({message:"setUser()",user,port:this.portName});
        
        this.settings.user = user || {};  

        var cb = callback||nop;
        cb(200,user)
    }


    getUserWeight() {
        
        if (!this.settings || !this.settings.user || !this.settings.user.weight)
            return 75;
        return this.settings.user.weight
    }

    getBikeWeight() {
        return 10;
    }

    unblock() {
        this.blocked= false;
    }

    connect() {
        this.logger.logEvent({message:"connect()",sp:(this.sp!==undefined),connected:this.connected, blocked:this.blocked,port:this.portName,settings:this.settings});

        if ( this.connected || this.blocked) {
            return;
        }

        this.state.busy = true;
        this.state.commandsInQueue={};
        try {
            if ( this.sp===undefined ) {

                if ( this.tcpip) {
                    const {host,port} = this.tcpipConnection                     
                    this.logger.logEvent({message:"creating TCPSocketPort",host,port});
                    this.sp = new TcpSocketPort( {host, port,net})
                }
                else {
                    const settings = this.settings.port || {}
                    settings.autoOpen=false;
    
                    this.logger.logEvent({message:"creating SerialPort",port:this.port,settings});
                    this.sp = new __SerialPort( this.port,settings);
                }

                this.sp.on('open', this.onPortOpen.bind(this) );            
                this.sp.on('close', this.onPortClose.bind(this));            
                this.sp.on('error', (error)=>{this.onPortError(error)} );    

                this.sp.on('data', (data)=>{ this.onData(data)} );        
            }
            const start= Date.now()
            this.state.connecting = true;
            if ( !this.state.opening)
                this.state.opening= { start, timeout:start+this.getTimeoutValue(), retry:0, maxRetries:MAX_RETRIES}
            else  {
                this.state.opening.start=start
                this.state.opening.timeout = start+this.getTimeoutValue();
                this.state.opening.retry = this.state.opening.retry+1;
            }

            this.logger.logEvent({message:"opening port ..."});
            this.sp.open()
                

        }
        catch (err)  {
            this.logger.logEvent({message:"scan:error:",error:err.message, stack:err.stack});
            this.state.busy=false;
        }               

    }

	async reconnect() {
        //this.sp=undefined;
        await this.saveClose();
		await this.saveConnect();
	}




    saveConnect() {
        return new Promise( (resolve,reject)=> {
            if ( this.isConnected() ) {
                this.state.connecting = false;
                return resolve(true);
            }

            this.connect();
            const tTimeout = Date.now()+TIMEOUT_START;
            const iv = setInterval( ()=>{
                if ( this.isConnected() ) {
                    this.state.connecting = false;
                    resolve(true);
                    clearInterval(iv);
                }
                else {
                    if ( Date.now()>tTimeout ) {
                        this.state.connecting = false;
                        reject( new Error('timeout') );
                        clearInterval(iv);
                    }
                }
            } ,100)
        })
    }


    onPortOpen() {
        this.error = undefined;
        this.connected = true;        
        this.state.opening = undefined;
        this.state.opened = true;
        this.state.busy=false;

        this.logger.logEvent({message:"port opened",port:this.portName});
    }

    onPortClose() {
        this.logger.logEvent( {message:"port closed",port:this.portName});
        
        this.error = undefined;
        this.connected = false;
        if ( this.state.opening) {
            this.state.opened = false;
            this.state.closed = true;
        }
        else {
            this.state = { opened:false, closed:true, busy:false}
        }

        this.sp = undefined;
        
        if ( this.queue!==undefined )
            this.queue.clear();
    }

    onPortError(error) {

        
        this.logger.logEvent({message:"port error:",port:this.portName,error:error.message,connected:this.connected,state:this.state});
        this.error = error;

        if ( this.blocked) {
            if ( !this.state.closed) {                
                if (this.sp)
                    this.sp.close();
                this.state = { opened:false, closed: true, busy:false}
            }
            return;
        }

        const reconnect = ()=> {
            if ( this.state.opening && !this.state.closing) {
                this.logger.logEvent({message:"retry connection:",portName:this.port,connected:this.connected});
                this.connect();
            }
        }

        if (this.state.closing) {

            if ( error.message==='Port is not open') {
                this.state = {opened:false, closed:true,busy:false}
                return;
            }
            else {
                const {retry,maxRetries} = this.state.closing 
                if ( (retry+1<maxRetries)) {
                    this.state.closing.retry = retry+1;
                    return setTimeout( ()=> {this.close()}, CLOSE_RETRY_TIMEOUT)
                }
                else {
                    this.logger.logEvent({message:"close request failed - giving up",port:this.portName});
                    this.state.closing = undefined;
                }            
            }

        }
        else if ( this.state.opening) {
            if (!this.state.connect) {
                const {retry,maxRetries}= this.state.opening;
                try {
                    if (this.sp)
                        this.sp.close();
                }
                catch (err) {
                    console.log(err);
                }
            
                if ( (retry+1)<maxRetries) {
                    this.state.opening.retry = retry+1;
                    setTimeout( ()=> {
                        if ( !this.state.busy)
                            reconnect()
                        else {
                            const iv = setInterval ( ()=> {
                                if ( !this.state.busy) {
                                    clearInterval(iv);
                                    reconnect();
                                }
                            },50)    
                        }
                    },OPEN_RETRY_DELAY)
        
                }  
                else {
                    this.state.opening = undefined;
                }  
            }
            else {
                this.onPortOpen();
            }
    
        }
        else if (this.state.sending) {
            // TODO
            this.logger.logEvent({message:"closing port",port:this.portName});
            this.sp.close();
            this.state = { opened:true, closed:false, busy:true}
        }

        this.state.busy=false;
        
    }

    errorHandler() {
        throw new Error("Error");
    }


    saveClose(force?) {
        return new Promise ( (resolve, reject) => {
            if (force)
                this.blocked = true;

            this.close();
            const start = Date.now();
            const iv = setInterval( ()=>{
                if ( this.state.closed || (Date.now()-start > DEFAULT_TIMEOUT)) {
                    clearInterval(iv);
                    resolve(true);
                    return;
                }


            }, 50 ) 
        })
    }

    close() {

        this.logger.logEvent( {message:'close request',port:this.portName});

        var port = this.sp;

        if (this.cmdWorker!==undefined) {
            this.logger.logEvent( {message:"stopping worker",port:this.portName});
            clearInterval(this.cmdWorker);
            this.cmdWorker=undefined;
        }

        let connected = this.connected ;
        try {
            if ( connected) {
                if( port ) {
                    port.unpipe();
                    port.flush();    
                    port.close();
                }
           
                this.connected = false;
                if ( this.queue!==undefined ) {
                    this.queue.clear();
                    this.queue=undefined;
                }
        
            }
            else {
                if (port)
                    port.close()
            }    
        }
        catch(err) {
            this.logger.logEvent( {message: 'close: Exception', port:this.portName, error:err.message});
        }

        const start= Date.now();
        if ( this.state.closing===undefined) 
            this.state.closing={ start, timeout: start+this.getTimeoutValue(),retry:0, maxRetries:MAX_RETRIES}
        else {
            this.state.closing.start = start;
            this.state.closing.timeout =  start+this.getTimeoutValue();
            this.state.retry = this.state.retry+1;
        }
        this.state.busy=false;
    }

    sendTimeout  (message) {
        this.logger.logEvent({message:`sendCommand:${message||'timeout'}`,port:this.portName,cmd:this.cmdCurrent});
        delete this.state.commandsInQueue[this.cmdCurrent.command];
        if (this.cmdCurrent.callbackErr!==undefined) {
            let cb = this.cmdCurrent.callbackErr;
            this.state.busy=false;
            this.cmdCurrent=undefined;
            this.cmdStart=undefined;
            cb(408,{ message: message || "timeout"} )            
        }
    } 

    checkForTimeout( reject ) {
        
        const d = Date.now();
        const s = this.state.sending;
        if ( s===undefined)
            return;
        
        try {
            if ( !this.state.sending) 
                return;   

            if ( this.state.waitingForACK ) {
                const timeoutACK  =  this.state.ack ? this.state.ack.timeout : this.state.sending.timeout;
                if ( d<timeoutACK)
                    return;

                reject( new Error('ACK timeout') )
                return;
            }

            if ( d<this.state.sending.timeout)
                return;

            reject( new Error('RESP timeout') )            
            return;
    
        }
        catch ( err) {
            this.logger.logEvent({message:'checkForTimeout: Exception', port:this.portName, error:err.message, stack:err.stack})
        }

    }

    getTimeoutValue(cmd?) {
        let timeout = DEFAULT_TIMEOUT;
        if ( this.settings && this.settings.tcpip && this.settings.tcpip.timeout)
            timeout =this.settings.tcpip.timeout

        if ( this.settings && this.settings.serial && this.settings.serial.timeout)
            timeout =this.settings.serial.timeout

        if ( cmd!==undefined && cmd.options!==undefined && cmd.options.timeout!==undefined) {
            timeout = cmd.options.timeout;
        }
        return timeout;
    }


    /*
        Daum 8i Commands
    */

    onData (data)  {

        let cmd ='';
        
        const bufferData = Buffer.isBuffer(data) ? data: Buffer.from(data,'latin1') 
        const s = this.state.sending;
        if ( s===undefined) {
            if ( this.state.input === undefined) 
                this.state.input = bufferData;
            return;
        }

        const {portName, resolve} = this.state.sending;

        let incoming;
        if ( this.state.input!==undefined) {
            const arr = [ this.state.input, bufferData ]
            incoming= Buffer.concat(arr)
        }
        else {
            incoming = bufferData;
        }

        const response = [...incoming];
        this.logger.logEvent({message:'sendCommand:RECV',data:hexstr(response) })

        for (let i=0;i<incoming.length;i++)
        //incoming.forEach( async (c,i)=> 
        {
            const getRemaining = ()=> {
                let remaining=''
                const done = i===(incoming.length-1);
                if (!done) {
                    for ( let j=i+1; j<incoming.length;j++)
                        remaining +=  String.fromCharCode( incoming.readUInt8(j) )
                }
                return remaining;
            }

            const c= incoming.readUInt8(i)
            if ( c===0x06) {
                this.logger.logEvent({message:"sendCommand:ACK received:",port:portName});
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                const remaining = getRemaining()
                if (  remaining && remaining!=='') return this.onData(remaining)
            }
            else if ( c===0x15) {
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                this.logger.logEvent({message:"sendCommand:NAK received:",port:portName});
                const remaining = getRemaining()
                if (  remaining && remaining!=='') return this.onData(remaining)

                // TODO: retries
            }
            
            else if ( c===0x01) {
                this.state.waitingForEnd = true;    
            }

            else if ( c===0x17) {
                const remaining = getRemaining();
                this.logger.logEvent({message:"sendCommand:received:",port:portName,cmd: `${cmd} [${hexstr(cmd)}]`,remaining: hexstr(remaining)});
                this.state.waitingForEnd = false;   
                const cmdStr = cmd.substring(0,cmd.length-2)
                const checksumExtracted  = cmd.slice(-2)
                const checksumCalculated = checkSum( getAsciiArrayFromStr(cmdStr),[])

                if ( checksumExtracted===checksumCalculated) {
                    this.sendACK();
                    if (this.state.sending.timeoutCheckIv) clearInterval(this.state.sending.timeoutCheckIv);
                    this.state= {
                        sending: undefined,
                        busy:false,
                        writeBusy: false,        
                        waitingForStart: false,
                        waitingForEnd: false,
                        waitingForACK: false,
                    }    
                    const payload = cmd.substring(3,cmd.length-2)
    
                    resolve(payload);        
                }
                else {
                    this.sendNAK();
                }
                cmd = '';
                if ( remaining)
                    return this.onData( remaining);

                
            }
            else {
                if ( this.state.waitingForEnd)
                    cmd += String.fromCharCode(c)
            }


        }

    }


    sendDaum8iCommand( command, queryType, payload) {

        return new Promise ( async (resolve,reject) => {

            if ( this.blocked)
                reject( new Error('blocked'))

            if ( !this.state.busy) {
                this.state.busy = true;

                if (!this.connected) {
                    reject ( new Error('not connected'));

                    if ( !this.state.connecting) {
                        this.saveConnect()
                        .then( () => {this.state.busy=false} )
                        .catch( (reason)=> {this.state.busy=false} )    
                    }
                    
                    return;
                }

            }
            else 
            {             
                let start = Date.now();
                while ( this.state.busy && Date.now()-start<5000) {
                    await sleep(500)
                }
                if ( this.state.busy ) {
                    reject( new Error('BUSY timeout'))
                    return;
                }

                this.state.busy = true;
            }

            const port = this.sp;
            const portName = this.portName;
            this.state.received = [];
        
    
            try {    
                const message = buildMessage( command,payload)
                const start= Date.now();
                const timeout =  start+this.getTimeoutValue() ;
                this.logger.logEvent({message:"sendCommand:sending:",port:this.portName,cmd:command,hex:hexstr(message)});
    


                this.state.writeBusy =true;
                if(!this.connected) {
                    this.logger.logEvent({message:"sendCommand:error: not connected",port:this.portName});
                    this.state.writeBusy =false;
                    this.state.busy = false;
                    this.state.sending = undefined;
                    return reject( new Error('not connected'))
                }    
                port.write( message);
                this.state.waitingForACK = true;
                this.state.writeBusy =false;
                this.state.retry = 0;

                this.state.ack= { start, timeout }
                this.state.sending = { command,payload, start, timeout,port, portName, resolve,reject}

                this.state.sending.timeoutCheckIv = setInterval( ()=>{ 
                    this.checkForTimeout( (err)=> {
                        console.log(err.message,this.state.retry, this.state.retryBusy);
                        if ( this.state.retry>2) {
                            clearInterval(this.state.sending.timeoutCheckIv);
                            this.state.sending.timeoutCheckIv = undefined;
                            return reject(err)
                        }

                        if ( this.state.retryBusy)
                            return;
                    
                        this.state.retryBusy = true;
                        this.state.retry++;
                        setTimeout( ()=> {
                            const restart = Date.now();
                            this.state.ack = { start:restart, timeout:restart+this.getTimeoutValue() }
                            this.logger.logEvent({message:"sendCommand:retry:",port:this.portName,cmd:command,hex:hexstr(message)});
                            port.write(message);
                            this.state.retryBusy = false;
                        }, this.sendRetryDelay)

                    })
                })
                    
        
            }
            catch (err)  {
                this.logger.logEvent({message:"sendCommand:error:",port:portName,error:err.message,stack:err.stack});
                this.state.writeBusy =false;
                this.state.busy = false;
                this.state.sending = undefined;
                reject(err)
            }          
    
        });
    }


    sendACK() {
        const port = this.portName;
        this.state.writeBusy =true;
        try {
            this.sp.write( [0x06]); // send ACK
        }
        catch(err) {}
        this.state.writeBusy =false;
        this.logger.logEvent({message:"sendCommand:sending ACK",port,queue:this.state.commandsInQueue});
    }

    sendNAK() {
        const port = this.portName;
        try {
            this.sp.write( [0x15]); // send NAK
        }
        catch(err) {}
        this.logger.logEvent({message:"sendCommand:sending NAK",port});
    }

    sendReservedDaum8iCommand( command,cmdType, data)  {
        let cmdData = [];
        const key = getReservedCommandKey(command);
        append( cmdData, Int16ToIntArray(key) );
        if ( data!==undefined && data.length>0) {
            append( cmdData, Int16ToIntArray( data.length) )
            append( cmdData, data)
        }
        else {
            append( cmdData, Int16ToIntArray(0) )
        }


        return this.sendDaum8iCommand('M70',cmdType, bin2esc(cmdData))
        .then ( (resData) =>  {
            const cmd = esc2bin(resData);
            cmd.splice(0,4); // remove key(2bit), length (2bit)
            return cmd;
        });
    }


    /*
    ====================================== Commands ==============================================
    */

    getProtocolVersion() {

        return  this.sendDaum8iCommand('V00','AF', [])
        .then( (data: string) =>  {    
                const version = data.substring(0,1)+'.'+ data.substring(1)
                return(version)    
        });
    }


    getDashboardVersion() {

        return this.sendDaum8iCommand('V70','AF', []);
        
    }

    getDeviceType() {

        return this.sendDaum8iCommand('Y00','AF', [])
        .then ( (str) =>  {
            let deviceType;
            if ( str === '0' ) deviceType= 'run';
            else if ( str === '2' ) deviceType= 'bike';
            else if ( str === '7' ) deviceType= 'lyps';
            else 
                throw( new Error(`unknown device type ${typeof str ==='string' ? ascii(str.charAt(0)): str }`))
            return deviceType;
        });          
    }


    getActualBikeType() {
        return this.sendDaum8iCommand('M72','AF', [])
        .then(  (str) =>  {
            let deviceType;
            if ( str === '0' ) deviceType= ACTUAL_BIKE_TYPE.ALLROUND;
            else if ( str === '1' ) deviceType= ACTUAL_BIKE_TYPE.RACE;
            else if ( str === '2' ) deviceType= ACTUAL_BIKE_TYPE.MOUNTAIN;
            else {
                throw( new Error(`unknown actual device type ${ typeof str ==='string' ? ascii(str.charAt(0)): str }`))
            }
            this.state.actualBikeType = deviceType;
            return deviceType
        });          
    }

    setActualBikeType( actualBikeType) {

        let bikeType;

        switch (actualBikeType) {
            case ACTUAL_BIKE_TYPE.ALLROUND:
                bikeType ='0';break;
            case ACTUAL_BIKE_TYPE.RACE:
                bikeType ='1';break;
            case ACTUAL_BIKE_TYPE.TRIATHLON:
                bikeType ='1';break;
            case ACTUAL_BIKE_TYPE.MOUNTAIN:
                bikeType ='2';break;
            default:
                bikeType = undefined;
        }
 
        return this.sendDaum8iCommand(`M72${bikeType}`,'BF', [])
        .then ( (str) =>  {
            let deviceType;
                if ( str === '0' ) deviceType= ACTUAL_BIKE_TYPE.ALLROUND;
                else if ( str === '1' ) deviceType= ACTUAL_BIKE_TYPE.RACE;
                else if ( str === '2' ) deviceType= ACTUAL_BIKE_TYPE.MOUNTAIN;
                else 
                    throw( new Error('unknown actual device type'))
            this.state.actualBikeType = deviceType;
            return deviceType
        });          
    }

    getTrainingData( ) {
        return this.sendDaum8iCommand('X70','AF',[])
        .then ( (data) =>  {
            const td = parseTrainingData(data); 
            return td;
        })
    }

    setLoadControl( enabled ) {
        const val = enabled? ascii('1'): ascii('0');
        return this.sendDaum8iCommand('S20','BF',[val])
        .then( (data) =>  {            
            const res = data==='1';
            return res
        })
    }

    getLoadControl() {
        return this.sendDaum8iCommand('S20','AF',[])
        .then( (data) =>  {
            const res = data==='1';
            return res    
        })
    }

    setSlope ( slope) {
        this.logger.logEvent( {message:'setSlope not implemted'})
        return;
    }

    setPower( power ) {
        const powerStr = Number.parseFloat(power).toFixed(2);
        return this.sendDaum8iCommand(`S23${powerStr}`,'BF',[])
        .then( (str: string) =>  {
            return  parseInt(str);
        })
        
    }

    getPower( power ) {
        return this.sendDaum8iCommand('S23','AF',[])
        .then( (str: string) =>  {
            return  parseInt(str);
        })
    }


    setPerson( person ) {
        return this.sendReservedDaum8iCommand('PERSON_SET','BF',person.getData())
    }


    setGear( gear ) {

        return this.sendDaum8iCommand('M71','BF',`${gear}`)
        .then( (str: string) =>  {
            const gearVal = parseInt(str);
            return  gearVal>0 ? gearVal-1 : undefined;
        })
    }

    getGear( ) {
        return this.sendDaum8iCommand('M71','AF','')
        .then( (str: string) =>  {
            return parseInt(str);
        })
    }




}


export class Daum8iTcp extends Daum8i {
    static getClassName() { return "Daum8i" }

    getType() { return "Daum8iTcp"; }

    static setSerialPort(spClass) { }
    getInterface() { return BIKE_INTERFACE.TCPIP}

    static setNetImpl(netClass) { 
        net= netClass; 
    }

    static getSupportedInterfaces() {
        return [ BIKE_INTERFACE.TCPIP]
    }

}

export class Daum8iSerial extends Daum8i {
    static getClassName() { return "Daum8i" }

    getType() { return "Daum8iSerial"; }
    getInterface() { return BIKE_INTERFACE.SERIAL}

    static setSerialPort(spClass) { 
        __SerialPort= spClass;
    }

    static setNetImpl(netClass) {}

    static getSupportedInterfaces() {
        return [ BIKE_INTERFACE.SERIAL]
    }

}
