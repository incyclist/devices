import {ACTUAL_BIKE_TYPE,BIKE_INTERFACE} from "../constants"
import {buildMessage,hexstr,ascii,bin2esc, esc2bin,parseTrainingData, checkSum, getAsciiArrayFromStr, getPersonData, ReservedCommands, routeToEpp, getBikeType} from './utils'
import {SerialInterface, SerialPortProvider } from '../..'
import {Queue} from '../../../utils/utils';
import {EventLogger} from 'gd-eventlog'
import { User } from "../../../types/user";
import { Route } from "../../../types/route";
import { SerialCommProps } from "../../comm";
import { SerialPortStream } from "@serialport/stream";
import { OnDeviceStartCallback } from "./types";

const DEFAULT_TIMEOUT = 10000;
const MAX_DATA_BLOCK_SIZE = 512;

const DS_BITS_OFF = 0;
//const DS_BITS_NO_PROGRAM_ADAPTION = 1;
const DS_BITS_ENDLESS_RACE = 2;

const DEBUG_LOGGER = {
    log: (e,...args) => console.log(e,...args),
    logEvent: (event) => console.log(JSON.stringify(event))
}

const validateHost = (host:string) =>  {
    const ipParts = host.split('.')
    if (ipParts.length>1)
        return ipParts.map(p=>Number(p)).join('.')
    return host
}

const validatePath = (path:string):string => {
    const parts = path.split(':');
    if (parts.length<2)
        return path;

    const host = validateHost(parts[0]);
    const port = parts[1]

    return `${host}:${port}`
}

const drain = (sp)=> new Promise( resolve=> { sp.drain( resolve)})

export default class Daum8i  {
    
    logger: EventLogger;
    serial: SerialInterface;
    path: string
    
    tcpipConnection: { host:string, port:string}
    port: string;
    settings: any;
    sp: SerialPortStream;
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
    spp: SerialPortProvider;

    serialportProps: any


    /*
    ====================================== Comstructor ==============================================
    */
    constructor( props: SerialCommProps) {
        
        this.props  = props || {};

        const {logger, serial, path} = props;

        this.serial = serial;
        this.path = validatePath(path);
        const w = global.window as any
    
        this.logger = logger || (w?.DEVICE_DEBUG||process.env.DEBUG? DEBUG_LOGGER as EventLogger : new EventLogger('DaumPremium')) ;

        this.isLoggingPaused = false;
        this.connected = false;        
        this.blocked = false;
        this.state = {
            ack: { wait:false, startWait: undefined},
            commandsInQueue: {},
        }
        this.settings = {}

        this.bikeData = {
            userWeight:75,
            bikeWeight:10,
            maxPower: 800
        }
        
    }
    /*
    ====================================== Statics ==============================================
    */


    getInterface() {
        return this.serial?.ifaceName;
    }


    getPort() {
        return this.path
    }

    isConnected() {
        return this.connected;
    }


    pauseLogging() {
        this.isLoggingPaused =true;
    }
    resumeLogging() {
        this.isLoggingPaused =false;
    }

    logEvent(e) {
        if(this.isLoggingPaused)
            return;

        this.logger.logEvent(e)
        const w = global.window as any
        if (w?.DEVICE_DEBUG) {
            console.log('~~~ DaumPremium', e)
        }

    }


    async connect():Promise<boolean> {
        if ( this.isConnected()  && this.sp) {            
            return true;
        }
    
        try {
            const port = await this.serial.openPort(this.path)

            if (port!==null) {
                this.connected = true;
                this.sp = port;

                this.sp.on('close', this.onPortClose.bind(this));            
                this.sp.on('error', (error)=>{this.onPortError(error)} );    
                this.sp.on('data', (data)=>{ this.onData(data)} );  
                return true;   
            }
            else {
                return false;
            }
        }
        catch {
            return false;
        }

    }

    async close():Promise<boolean> {

        if (this.isConnected() && this.serial && this.sp) {     
            try {  
                await this.flush();    
                await this.serial.closePort(this.path)
            }
            catch(err) {
                this.logEvent({message:'could not close ', reason:err.message})
                return false
            }
        }

        this.connected = false;
        if (this.sp) {
            this.sp.removeAllListeners()
            this.sp = null;
        }

        return true;
    }

    async flush():Promise<void> {
        if (!this.state.writeBusy)
            return;

        return new Promise( done=> {

            
                const iv = setInterval( ()=>{
                    if (!this.state.writeBusy) {
                        clearInterval(iv)
                        this.writeDone()
                        done()
                    }
                    
                }, 100)
            
            
    
        })

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

    // port was closed
    async onPortClose() {
        this.connected = false;
        if (this.sp) {
            this.sp.removeAllListeners()
            this.sp = null;
        }

    }

    async onPortError(error) {

        this.logEvent({message:"port error:",port:this.path,error:error.message,connected:this.connected,state:this.getLogState()});
        this.error = error;

        if ( this.blocked) {
            if ( !this.state.closed) {                
                await this.close()
            }
            return;
        }

        if (this.state.sending) {

            if (this.state.sending.reject)
                this.state.sending.reject(error)
            this.writeDone();
            //this.state.error = error;
            await this.close()
            return;
        }

        this.state.busy=false;
        
    }


    async forceClose(updateState=false) {
        if ( !this.sp )
            return;
        
        try {
            await this.close()
            this.writeDone();
            if ( this.queue!==undefined )
                this.queue.clear();
        }
        catch {}


        this.connected = false;
        
        if (updateState)
            this.state = { opened:false, closed:true, busy:false}
    }



    sendTimeout  (message) {
        this.logEvent({message:`sendCommand:${message||'timeout'}`,port:this.path,cmd:this.cmdCurrent});
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
            this.logEvent({message:'checkForResponse: Exception', port:this.path, error:err.message, stack:err.stack})
        }
        return true;

    }

    getTimeoutValue(cmd?) {
        let timeout = DEFAULT_TIMEOUT;
        if ( this.settings && this.settings.timeout)
            timeout =this.settings.timeout

        if ( cmd!==undefined && cmd.options!==undefined && cmd.options.timeout!==undefined) {
            timeout = cmd.options.timeout;
        }
        return timeout;
    }


    /*
        Daum 8i Commands
    */

    async onData (data, depth=0)  {
        let cmd ='';
        const MAX_DEPTH = 5

        if ( this.state.waitingForEnd) {
            cmd = this.state.partialCmd;
        }

        
        const bufferData = Buffer.isBuffer(data) ? data: Buffer.from(data,'latin1') 

        const s = this.state.sending;
        if ( s===undefined ) {
            this.logEvent({message:'onData:IGNORED',data:bufferData.toString('hex') })
            return;
        }

        const {portName, resolve} = this.state.sending;
        
        let incoming = bufferData;
        this.logEvent({message:'sendCommand:RECV',data:hexstr(incoming) })

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
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                const remaining = getRemaining()
                this.logEvent({message:"sendCommand:ACK received:",port:portName,remaining:hexstr(remaining)});
                if (  remaining && remaining!=='' && depth<MAX_DEPTH) return this.onData(remaining, depth+1)
            }
            else if ( c===0x15) {
                this.state.waitingForStart = true;
                this.state.waitingForACK = false;
                const remaining = getRemaining()
                this.logEvent({message:"sendCommand:NAK received:",port:portName,remaining:hexstr(remaining)});
                if (  remaining && remaining!=='' && depth<MAX_DEPTH) return this.onData(remaining,depth+1)

                // TODO: retries
            }
            
            else if ( c===0x01) {
                this.state.waitingForEnd = true;    
            }

            else if ( c===0x17) {
                const remaining = getRemaining();
                // special case: receiving and "echo" of previous command while waiting for ACK
                if (this.state.waitingForACK) {
                    // ignore command
                    this.logEvent({message:"sendCommand:ignored:",duration: Date.now()-this.state.sending.tsRequest,port:portName,cmd: `${cmd} [${hexstr(cmd)}]`,remaining: hexstr(remaining)});
                    this.state.waitingForEnd = false;   




                }
                else {
                    this.logEvent({message:"sendCommand:received:",duration: Date.now()-this.state.sending.tsRequest,port:portName,cmd: `${cmd} [${hexstr(cmd)}]`,remaining: hexstr(remaining)});
                    this.state.waitingForEnd = false;   
                    const cmdStr = cmd.substring(0,cmd.length-2)
                    const checksumExtracted  = cmd.slice(-2)
                    const checksumCalculated = checkSum( getAsciiArrayFromStr(cmdStr),[])
    
                    if ( checksumExtracted===checksumCalculated) {
                        await this.sendACK();
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
                        await this.sendNAK();
                    }
    
                }


                cmd = '';
                if ( remaining && depth<5)
                    return this.onData( remaining,depth+1);

                
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


    sendDaum8iCommand( command:string, payload:string|any[]=''):Promise<string> {

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
                this.logEvent({message:'sendCommand:waiting',port:this.path,cmd:command,hex:hexstr(message)})
                
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
                    this.logEvent({message:'sendCommand:busy timeout',port:this.path,cmd:command,hex:hexstr(message),duration: Date.now()-tsRequest})
                    return reject( new Error('BUSY timeout'))        
                }
                this.state.busy = true;
            }

            const port = this.sp;
            const portName = this.path;
            this.state.received = [];
        
    
            try {    
                const message = buildMessage( command,payload)
                const start= Date.now();
                const timeout =  start+this.getTimeoutValue() ;
                this.logEvent({message:"sendCommand:sending:",port:this.path,cmd:command,hex:hexstr(message)});
    


                this.state.writeBusy =true;
                if(!this.connected || port===undefined) {
                    this.logEvent({message:"sendCommand:error: not connected",port:this.path});
                    this.writeDone()
                    return reject( new Error('not connected'))
                }    

                await this.write( Buffer.from(message));

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


    async write(buffer:Buffer):Promise<void> {

        return new Promise( async done=> {
            this.state.writeBusy =true;
            try {
                await this.sp.write( buffer) 
                this.state.writeBusy =false;        
                done()
                
            }
            catch(err) {
                this.state.writeBusy =false;        
                done()
            }
    
        })

    }


    async sendACK() {       
        this.logEvent({message:"sendCommand:sending ACK",port:this.path,queue:this.state.commandsInQueue});
        await this.write( Buffer.from([0x06]))
    }

    async sendNAK() {
        this.logEvent({message:"sendCommand:sending NAK",port:this.path,queue:this.state.commandsInQueue});
        await this.write( Buffer.from([0x15]))
    }

    sendReservedDaum8iCommand( command:ReservedCommands, data?:Buffer)  {
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

        return this.sendDaum8iCommand('M70', bin2esc(cmdData))
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

        return  this.sendDaum8iCommand('V00')
        .then( (data: string) =>  {    
                const version = data.substring(0,1)+'.'+ data.substring(1)
                return(version)    
        });
    }


    getDashboardVersion() {

        return this.sendDaum8iCommand('V70');
        
    }

    getDeviceType() {

        return this.sendDaum8iCommand('Y00')
        .then ( (str) =>  {
            let deviceType;
            if ( str === '0' ) deviceType= 'run';
            else if ( str === '2' ) deviceType= 'bike';
            else if ( str === '7' ) deviceType= 'lyps';
            else 
                throw( new Error(`unknown device type ${typeof str ==='string' ? str: ascii(str)}`))
            return deviceType;
        });          
    }


    getActualBikeType() {
        return this.sendDaum8iCommand('M72')
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
 
        return this.sendDaum8iCommand(`M72${bikeType}`)
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
        return this.sendDaum8iCommand('X70')
        .then ( (data:string) =>  {
            const td = parseTrainingData(data); 
            
            return td;
        })
        
    }

    setLoadControl( enabled ) {
        const val = enabled? ascii('1'): ascii('0');
        return this.sendDaum8iCommand('S20',[val])
        .then( (data) =>  {            
            const res = data==='1';
            return res
        })
    }

    getLoadControl() {
        return this.sendDaum8iCommand('S20')
        .then( (data) =>  {
            const res = data==='1';
            return res    
        })
    }

    setPower( power ) {
        const powerStr = Number.parseFloat(power).toFixed(2);
        return this.sendDaum8iCommand(`S23${powerStr}`)
        .then( (str: string) =>  {
            return  parseInt(str);
        })
        
    }

    getPower( power ) {
        return this.sendDaum8iCommand('S23')
        .then( (str: string) =>  {
            return  parseInt(str);
        })
    }


    setPerson( person:User ): Promise<boolean> {
        const {sex,age,length,weight} = person;
        this.logEvent( {message:'setPerson() request',sex,age,length,weight })
        return this.sendReservedDaum8iCommand( ReservedCommands.PERSON_SET, getPersonData(person))
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
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_BEGIN)
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
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_NEW_PROGRAM,payload)
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
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_CONTINUE_PROGRAM, payload)
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
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_END)
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
            return false;
        }
        return false;
        
    }


    startProgram( programId: number = 1):Promise<boolean> {
        const payload = Buffer.alloc(2);

        payload.writeInt16LE(programId,0);
        this.logEvent( {message:'startProgram() request', programId})
        return this.sendReservedDaum8iCommand( ReservedCommands.PROGRAM_LIST_START, payload)
        .then( (res:any[]) => {
            const buffer = Buffer.from(res);
            const success =  buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_START
            this.logEvent( {message:'startProgram() request', programId, success})
            
            if (!success) throw new Error('Illegal Response' )
            return true;;


        })
    }

    setGear( gear ) {

        return this.sendDaum8iCommand(`M71${gear}`)
        .then( (str: string) =>  {
            return parseInt(str);
//            const gearVal = parseInt(str);
//            return  gearVal>0 ? gearVal-1 : undefined;
        })
    }

    getGear( ) {
        return this.sendDaum8iCommand('M71')
        .then( (str: string) =>  {
            return parseInt(str);
        })
    }




}


