import {ACTUAL_BIKE_TYPE,BIKE_INTERFACE} from "../constants"
import TcpSocketPort from './tcpserial'
import {buildMessage,hexstr,ascii,bin2esc, esc2bin,parseTrainingData, checkSum, getAsciiArrayFromStr, getPersonData, ReservedCommands, routeToEpp, getBikeType} from './utils'

import {Queue} from '../../utils';


import {EventLogger} from 'gd-eventlog'
import { User } from "../../types/user";
import { Route } from "../../types/route";
import { OnDeviceStartCallback } from "../../device";

const nop = ()=>{}
const MAX_RETRIES = 5;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_SEND_DELAY = 1000;
const TIMEOUT_START = 15000;

const OPEN_TIMEOUT = 1000;

const DAUM_PREMIUM_DEFAULT_PORT= 51955;
const DAUM_PREMIUM_DEFAULT_HOST= '127.0.0.1';
const MAX_DATA_BLOCK_SIZE = 512;

const DS_BITS_OFF = 0;
//const DS_BITS_NO_PROGRAM_ADAPTION = 1;
const DS_BITS_ENDLESS_RACE = 2;

var __SerialPort = undefined;
var net = undefined;

const DEBUG_LOGGER = {
    log: (e,...args) => console.log(e,...args),
    logEvent: (event) => console.log(JSON.stringify(event))
}

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
    props: any;

    connected: boolean;
    blocked: boolean;
    state: any;
    bikeData: any;
    processor: any;
    error: Error;
    queue: Queue<any>
    cmdCurrent: any;
    cmdStart: number;
    isLoggingPaused: boolean;


    /*
    ====================================== Comstructor ==============================================
    */
    constructor( props) {

        
        this.props  = props || {};
        this.logger = process.env.DEBUG? DEBUG_LOGGER as EventLogger : new EventLogger('DaumPremium') ;

        if (this.props.interface==='tcpip') {
            const port = this.props.port || DAUM_PREMIUM_DEFAULT_PORT;
            const host = this.props.host || DAUM_PREMIUM_DEFAULT_HOST;
            this.portName = `${host}:51955`;
            this.tcpip = true;
            this.serial = false;
            this.tcpipConnection = {host,port};
        }
        else {
            this.portName = this.props.port || process.env.COM_PORT
            this.tcpip = false;
            this.serial = true;
            this.port = this.portName
        }


        this.settings = this.props.settings || {};        
        this.settings.logger  = this.logger;
        this.isLoggingPaused = false;

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


    pauseLogging() {
        this.isLoggingPaused =true;
    }
    resumLogging() {
        this.isLoggingPaused =false;
    }
    logEvent(e) {
        if(!this.isLoggingPaused)
            this.logger.logEvent(e)
    }

    /*
    ====================================== Bike Interface Implementation ==============================================
    */

   
    setUser(user, callback) {
        this.logEvent({message:"setUser()",user,port:this.portName});
        
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

    async connect() {
        this.logEvent({message:"connect()",sp:(this.sp!==undefined),connected:this.connected, blocked:this.blocked,port:this.portName,settings:this.settings});

        if ( this.connected || this.blocked) {
            return;
        }

        this.state.busy = true;
        this.state.commandsInQueue={};
        try {

            
            if ( this.sp!==undefined ) {
                await this.forceClose();
                this.sp = undefined
            }

            if ( this.sp===undefined ) {

                if ( this.tcpip) {
                    const {host,port} = this.tcpipConnection                     
                    const {logger} = this.props;
                    this.logEvent({message:"creating TCPSocketPort",host,port});
                    this.sp = new TcpSocketPort( {host, port,net, timeout:OPEN_TIMEOUT,logger})
                }
                else {
                    const settings = this.settings.port || {}
                    settings.autoOpen=false;
    
                    this.logEvent({message:"creating SerialPort",port:this.port,settings});
                    this.sp = new __SerialPort( this.port,settings);
                }

                this.sp.once('open', this.onPortOpen.bind(this) );            
                this.sp.once('close', this.onPortClose.bind(this));            
                this.sp.on('error', (error)=>{this.onPortError(error)} );    

                this.sp.on('data', (data)=>{ this.onData(data)} );        
            }


            const start= Date.now()
            this.state.connecting = true;
            this.state.opening= { start, timeout:start+this.getTimeoutValue()}

            this.logEvent({message:"opening port ..."});            
            await this.sp.open()
                

        }
        catch (err)  {
            this.logEvent({message:"connect:error:",error:err.message, stack:err.stack});
            this.state.busy=false;
        }               

    }

	async reconnect() {
        //this.sp=undefined;
        try {
            await this.saveClose();
		    await this.saveConnect();
        }
        catch {}
	}




    saveConnect() {

        return new Promise( async (resolve,reject)=> {

            if ( this.isConnected() ) {
                this.state.connecting = false;
                return resolve(true);
            }

            try {
                await this.connect();
            }
            catch {}


            const tTimeout = Date.now()+TIMEOUT_START;
            const iv = setInterval( async ()=>{
                try {

                    if ( this.state.error !== undefined) {
                        clearInterval(iv);
                        await this.forceClose()
                        reject(this.state.error);
    
                    }
                    else if ( this.isConnected() ) {
                        this.state.connecting = false;
                        resolve(true);
                        clearInterval(iv);
                    }
                    
                    else {
                        if ( Date.now()>tTimeout ) {
                            this.state.connecting = false;
                            await this.forceClose()
                            clearInterval(iv);
                            reject( new Error('timeout') );
                        }
                    }
    
                }
                catch {}
            } ,100)
        })
    }


    onPortOpen() {
        this.error = undefined;
        this.connected = true;        
        this.state.opening = undefined;
        this.state.opened = true;
        this.state.busy=false;

        this.logEvent({message:"port opened",port:this.portName});
    }

    onPortClose() {
        this.logEvent( {message:"port closed",port:this.portName});
        
        this.error = undefined;
        this.connected = false;
        if ( this.state.opening) {
            this.state.opened = false;
            this.state.closed = true;
        }
        else {
            this.state = { opened:false, closed:true, busy:false}
        }
        this.sp.removeAllListeners();
        this.sp = undefined;
        
        if ( this.queue!==undefined )
            this.queue.clear();
    }

    getLogState() {
        let s = undefined;
        const {sending, busy, opening, connecting,writeBusy,waitingForStart,waitingForAck,waitingForEnd,retry} = this.state;
        if (sending) {
            s = {};
            s.command = sending.command;
            s.payload = sending.payload;
        }
        return {sending:s, busy, writeBusy,opening, connecting, waitingForStart,waitingForEnd,waitingForAck,retry}

    }

    async onPortError(error) {


        this.logEvent({message:"port error:",port:this.portName,error:error.message,connected:this.connected,state:this.getLogState()});
        this.error = error;

        if ( this.blocked) {
            if ( !this.state.closed) {                
                await this.forceClose()
            }
            return;
        }

        if (this.state.closing) {

            if ( error.message==='Port is not open') {
                this.state = {opened:false, closed:true,busy:false}
                return;
            }
            else {
                await this.forceClose()
            }

        }
        else if ( this.state.opening) {
            if (this.state.connecting) {
                this.state.error = error;
            }
            else {
                this.onPortOpen();
            }
    
        }
        else if (this.state.sending) {

            if (this.state.sending.reject)
                this.state.sending.reject(error)
            this.writeDone();
            //this.state.error = error;
            await this.forceClose(false);
            return;
        }

        this.state.busy=false;
        
    }

    errorHandler() {
        throw new Error("Error");
    }


    async saveClose(force?) {

        return await this.close()
        /*
        return new Promise ( (resolve, reject) => {
            if (force)
                this.blocked = true;

            this.close();
            const start = Date.now();
            const iv = setInterval( ()=>{
                if ( this.state.closed || (Date.now()-start > DEFAULT_TIMEOUT)) {   
                    this.blocked = false;

                    clearInterval(iv);
                    resolve(true);
                    return;
                }


            }, 50 ) 
        })
        */
    }

    async forceClose(updateState=false) {
        const sp = this.sp;
        if ( !this.sp )
            return;
        
        this.state.closing = true;

        sp.removeAllListeners();
        sp.on('error',()=>{})

        try {
            sp.unpipe();
            sp.flush();    
        }
        catch {}


        try {
            await this.closePort(1000)
            this.writeDone();
            if ( this.queue!==undefined )
                this.queue.clear();
        }
        catch {}


        this.connected = false;
        
        if (updateState)
            this.state = { opened:false, closed:true, busy:false}
    }

    async closePort (timeout): Promise<boolean> {
        return new Promise( (resolve, reject)=> {
            let isClosed = false;

            const to = setTimeout(()=>{
                if (!isClosed) resolve(false)
            }, timeout)

            this.sp.removeAllListeners('close');
            this.sp.removeAllListeners('error');
            this.sp.on('error',()=>{})
            this.sp.once('close' ,()=>{        
                clearTimeout(to)
                isClosed = true;
                resolve(true)
            })
            this.sp.close();
        })
        
    }


    async close() {

        this.logEvent( {message:'close request',port:this.portName});

        var sp = this.sp;
        if (!sp) {
            this.state = { opened:false, closed:true, busy:false}
            this.connected = false;
            return;
        }


        let connected = this.connected ;

        try {
            if ( connected) {                
                try {
                    sp.removeAllListeners();
                    sp.on('error',()=>{})
                    sp.unpipe();
                    sp.flush();    
                }
                catch {} // ignore errors
            }

            await this.closePort(this.getTimeoutValue())

            this.writeDone();
            if ( this.queue!==undefined ) {
                this.queue.clear();
                this.queue=undefined;
            }
        
        }
        catch(err) {
            this.logEvent( {message: 'close: Exception', port:this.portName, error:err.message});
        }
        this.state = { opened:false, closed:true, busy:false}
        this.connected = false;

    }

    sendTimeout  (message) {
        this.logEvent({message:`sendCommand:${message||'timeout'}`,port:this.portName,cmd:this.cmdCurrent});
        delete this.state.commandsInQueue[this.cmdCurrent.command];
        if (this.cmdCurrent.callbackErr!==undefined) {
            let cb = this.cmdCurrent.callbackErr;
            this.state.busy=false;
            this.cmdCurrent=undefined;
            this.cmdStart=undefined;
            cb(408,{ message: message || "timeout"} )            
        }
    } 

    checkForResponse( ): boolean {      

        const d = Date.now();
        const s = this.state.sending;
        if ( s===undefined)
            return false;

        const rejectFn = s.reject;
        const reject = (err) => {
            
            if ( rejectFn && typeof rejectFn === 'function') {
                rejectFn(err);
            }
        }

        const error = this.state.error
        if ( error!==undefined) {
            reject(error);
            return false;
        }

        try {

            if ( this.state.waitingForACK ) {
                const timeoutACK  =  this.state.ack ? this.state.ack.timeout : this.state.sending.timeout;
                if ( d<timeoutACK)
                    return true;

                reject( new Error('ACK timeout') )
                return false;
            }

            if ( d<this.state.sending.timeout)
                return true;

            reject( new Error('RESP timeout') )            
            return false;
    
        }
        catch ( err) {
            this.logEvent({message:'checkForResponse: Exception', port:this.portName, error:err.message, stack:err.stack})
        }
        return true;

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

        if ( this.state.waitingForEnd) {
            cmd = this.state.partialCmd;
        }

        
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
        this.logEvent({message:'sendCommand:RECV',data:hexstr(response) })

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
                this.logEvent({message:"sendCommand:ACK received:",port:portName});
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                const remaining = getRemaining()
                if (  remaining && remaining!=='') return this.onData(remaining)
            }
            else if ( c===0x15) {
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                this.logEvent({message:"sendCommand:NAK received:",port:portName});
                const remaining = getRemaining()
                if (  remaining && remaining!=='') return this.onData(remaining)

                // TODO: retries
            }
            
            else if ( c===0x01) {
                this.state.waitingForEnd = true;    
            }

            else if ( c===0x17) {
                const remaining = getRemaining();
                this.logEvent({message:"sendCommand:received:",duration: Date.now()-this.state.sending.tsRequest,port:portName,cmd: `${cmd} [${hexstr(cmd)}]`,remaining: hexstr(remaining)});
                this.state.waitingForEnd = false;   
                const cmdStr = cmd.substring(0,cmd.length-2)
                const checksumExtracted  = cmd.slice(-2)
                const checksumCalculated = checkSum( getAsciiArrayFromStr(cmdStr),[])

                if ( checksumExtracted===checksumCalculated) {
                    this.sendACK();
                    if (this.state.sending && this.state.sending.responseCheckIv) { 
                        clearInterval(this.state.sending.responseCheckIv);
                    }
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

        if ( this.state.waitingForEnd) {
            this.state.partialCmd = cmd;
        }

    }


    sendDaum8iCommand( command, queryType, payload) {

        const tsRequest = Date.now();        

        return new Promise ( async (resolve,reject) => {

            if ( this.blocked)
                return reject( new Error('blocked'))

            if ( !this.state.busy) {
                this.state.busy = true;
            }
            else 
            {             
                const message = buildMessage( command,payload)
                this.logEvent({message:'sendCommand:waiting',port:this.portName,cmd:command,hex:hexstr(message)})
                
                const busyWait = ()=> {
                    return new Promise ( (done) => {

                        let start = Date.now();
                        let timeout = start+5000;
                        const iv = setInterval(()=> {
                            if ( this.state.busy) {  
                                if (Date.now()>timeout) {
                                    clearInterval(iv);
                                    done(false);
                                } 
                            }
                            else {
                                clearInterval(iv);
                                done(true);
                            }
                        }, 10) 
    
                    })
                }

                const res = await busyWait();
                if (!res) {
                    this.logEvent({message:'sendCommand:busy timeout',port:this.portName,cmd:command,hex:hexstr(message),duration: Date.now()-tsRequest})
                    return reject( new Error('BUSY timeout'))        
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
                this.logEvent({message:"sendCommand:sending:",port:this.portName,cmd:command,hex:hexstr(message)});
    


                this.state.writeBusy =true;
                if(!this.connected || port===undefined) {
                    this.logEvent({message:"sendCommand:error: not connected",port:this.portName});
                    this.writeDone()
                    return reject( new Error('not connected'))
                }    

                port.write( message);

                this.state.waitingForACK = true;
                this.state.writeBusy =false;
                this.state.retry = 0;

                this.state.ack= { start, timeout }
                this.state.sending = { command,payload, start, timeout,port, portName,tsRequest, resolve,reject}

                const iv = setInterval( ()=>{ 
                    const stillWaiting = this.checkForResponse();
                    if (!stillWaiting) {
                        clearInterval(iv);                        
                        this.writeDone();    
                    }
                },10)

                this.state.sending.responseCheckIv = iv;
                    
        
            }
            catch (err)  {
                this.logEvent({message:"sendCommand:error:",port:portName,error:err.message,stack:err.stack});
                this.writeDone();
                reject(err)
            }          
    
        });
    }


    writeDone ()  {
        this.state.writeBusy =false;
        this.state.busy = false;
        if (this.state.sending && this.state.sending.responseCheckIv) { 
            clearInterval(this.state.sending.responseCheckIv);
        }
        this.state.sending = undefined;
        this.state.waitingForStart = false;
        this.state.waitingForEnd = false;
        this.state.waitingForACK = false;
    }


    sendACK() {
        const port = this.portName;
        this.state.writeBusy =true;
        try {
            this.sp.write( [0x06]); // send ACK
        }
        catch(err) {}
        this.state.writeBusy =false;
        this.logEvent({message:"sendCommand:sending ACK",port,queue:this.state.commandsInQueue});
    }

    sendNAK() {
        const port = this.portName;
        try {
            this.sp.write( [0x15]); // send NAK
        }
        catch(err) {}
        this.logEvent({message:"sendCommand:sending NAK",port});
    }

    sendReservedDaum8iCommand( command:ReservedCommands,cmdType, data?:Buffer)  {
        let buffer;

        if ( data!==undefined && data.length>0) {
            buffer = Buffer.alloc(data.length+4);
            buffer.writeInt16LE(command,0);
            buffer.writeUInt16LE(data.length,2);
            data.copy(buffer,4);
        }
        else {
            buffer = Buffer.alloc(4);
            buffer.writeInt16LE(command,0);
            buffer.writeUInt16LE(0,2);            
        }

        const cmdData = Uint8Array.from(buffer);        

        return this.sendDaum8iCommand('M70',cmdType, bin2esc(cmdData))
        .then ( (res:string) =>  {

            const resData = Uint8Array.from(res, x => x.charCodeAt(0));
            const cmd = esc2bin(resData);

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
        this.logEvent( {message:'setSlope not implemted'})
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


    setPerson( person:User ): Promise<boolean> {
        const {sex,age,length,weight} = person;
        this.logEvent( {message:'setPerson() request',sex,age,length,weight })
        return this.sendReservedDaum8iCommand( ReservedCommands.PERSON_SET,'BF', getPersonData(person))
        .then( (res:any[]) => {
            const buffer = Buffer.from(res);
            const success = buffer.readInt16LE(0) === ReservedCommands.PERSON_SET
            this.logEvent( {message:'setPerson() response', success, buffer })

            if (!success) 
                throw new Error('Illegal Response' )
            return true;
        })
    }

    programUploadInit():Promise<boolean> {
        this.logEvent( {message:'programUploadInit() request'})
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_BEGIN,'BF')
        .then( (res:any[]) => {
            const buffer = Buffer.from(res);
            const success = buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_BEGIN
            this.logEvent( {message:'programUploadInit() response',success, buffer})
            if (!success) 
                throw new Error('Illegal Response' )
            return true;
        })
    }

    programUploadStart(bikeType:string, route?: Route):Promise<Uint8Array> {
        const payload = Buffer.alloc(40);
        
        const epp = route ? routeToEpp(route) : undefined;
        const eppLength = epp ? epp.length : 0;
        const bikeTypeVal = getBikeType(bikeType);
        const wBits = route.lapMode ? DS_BITS_ENDLESS_RACE:  DS_BITS_OFF;

        payload.writeInt32LE(0,0);              // pType
        payload.writeInt8(bikeTypeVal,4);          // bikeType       
        payload.writeInt8(0,5);                 // startAt (LSB)
        payload.writeInt16LE(0,6);              // startAt (HSB)
        payload.writeInt32LE(0,8);              // mType
        payload.writeInt32LE(0,12);             // duration
        payload.writeFloatLE(0,16);             // energy
        payload.writeFloatLE(0,20);             // value
        payload.writeInt16LE(0,24);             // startWatt
        payload.writeInt16LE(0,26);             // endWatt
        payload.writeInt16LE(0,28);             // deltaWatt
        payload.writeInt16LE(wBits,30);             // wBits
        payload.writeInt32LE(7,32);             // eppVersion (4) - EPP_CURRENT_VERSION
        payload.writeInt32LE(eppLength,36);    // eppSize
       
        this.logEvent( {message:'programUploadStart() request', bikeType, length:eppLength})        
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_NEW_PROGRAM,'BF', payload)
        .then( (res:any[]) => {
            const buffer = Buffer.from(res);
            if ( buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_NEW_PROGRAM) {
                this.logEvent( {message:'programUploadStart() response', success:true})
                return epp
            }
            this.logEvent( {message:'programUploadStart() response', success:false})
            throw new Error('Illegal Response' )
        })
    }

    

    programUploadSendBlock(epp: Uint8Array, offset: number):Promise<boolean> {
        
        const remaining = epp.length - offset;
        if (remaining<=0)
            return Promise.resolve(true);
        
        const size = remaining > MAX_DATA_BLOCK_SIZE? MAX_DATA_BLOCK_SIZE: remaining;

        const payload = Buffer.alloc(size+8);

        payload.writeInt32LE(size,0);              // size
        payload.writeInt32LE(offset,4);            // offset
        const chunk = Buffer.from(epp.slice(offset,offset+size));
        chunk.copy(payload,8);

        this.logEvent( {message:'programUploadSendBlock() request', offset, size})
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_CONTINUE_PROGRAM,'BF', payload)
        .then( (res:any[]) => {
            const buffer = Buffer.from(res);
            let success = buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_CONTINUE_PROGRAM  ;

            success = success && (buffer.readInt16LE(2) === 1);
            success = success && (buffer.readInt8(4) === 1);
            this.logEvent( {message:'programUploadSendBlock() response'})

            if (!success) throw new Error('Illegal Response' )
            return true;;
        })

    }


    programUploadDone():Promise<boolean> {
        this.logEvent( {message:'programUploadDone() request'})
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_END,'BF')
        .then( (res:any[]) => {
            const buffer = Buffer.from(res);
            const success =  buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_END;
            this.logEvent( {message:'programUploadDone() response', success})

            if (!success) throw new Error('Illegal Response' )
            return true;;
        })
    }

    async programUpload(bikeType:string, route: Route, onStatusUpdate?:OnDeviceStartCallback): Promise<boolean> {
        try {
            await this.programUploadInit();
            const epp = await this.programUploadStart(bikeType, route);
            if ( epp) {
                let success = true;
                let done = false;
                let offset = 0;
                if ( onStatusUpdate )
                    onStatusUpdate(0,epp.length);
                while (success && !done) {
                    success = await this.programUploadSendBlock(epp,offset);
                    offset += MAX_DATA_BLOCK_SIZE;
                    done = offset >= epp.length;
                    if ( onStatusUpdate )
                        onStatusUpdate(done? epp.length: offset,epp.length);
                }            
                if (done) {
                    return await this.programUploadDone()
                }    
            }
            else {
                return await this.programUploadDone()
            }
    
        }
        catch ( err ) {
            console.log( '~~~ err',err)
        }
        return false;
        
    }


    startProgram( programId: number = 1):Promise<boolean> {
        const payload = Buffer.alloc(2);

        payload.writeInt16LE(programId,0);
        this.logEvent( {message:'startProgram() request', programId})
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_START,'BF', payload)
        .then( (res:any[]) => {
            const buffer = Buffer.from(res);
            const success =  buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_START
            this.logEvent( {message:'startProgram() request', programId, success})
            
            if (!success) throw new Error('Illegal Response' )
            return true;;


        })
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
