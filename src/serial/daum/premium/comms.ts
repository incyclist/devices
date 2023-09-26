import {ACTUAL_BIKE_TYPE} from "../constants"
import {buildMessage,hexstr,ascii,bin2esc, esc2bin,parseTrainingData, checkSum, getAsciiArrayFromStr, getPersonData, ReservedCommands, routeToEpp, getBikeType} from './utils'
import {SerialInterface, SerialPortProvider } from '../..'
import {EventLogger} from 'gd-eventlog'
import { User } from "../../../types/user";
import { Route } from "../../../types/route";
import { SerialCommProps } from "../../comm";
import { SerialPortStream } from "@serialport/stream";
import { OnDeviceStartCallback } from "./types";
import { Queue, sleep } from "../../../utils/utils";


const DEFAULT_TIMEOUT = 10000;
const MAX_DATA_BLOCK_SIZE = 512;

const DS_BITS_OFF = 0;
//const DS_BITS_NO_PROGRAM_ADAPTION = 1;
const DS_BITS_ENDLESS_RACE = 2;

/* istanbul ignore next*/
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

export type ResponseObject = {
    type: ResponseType
    data?: string
    error?: Error
}

export type ResponseType = 'ACK'|'NAK'|'Response'|'Error'

export type Daum8iCommsState = {
    waitingForStart?:boolean
    waitingForACK?:boolean
    waitingForEnd?:boolean
    partialCmd?
    data: Queue<ResponseObject>
}

export type ConnectionState = 'Connecting' | 'Connected' | 'Disconnected' | 'Disconnecting'

export class CheckSumError extends Error {
    constructor() {
        super();
        this.message = 'checksum incorrect'
    }
}

export class ACKTimeout extends Error {
    constructor() {
        super();
        this.message = 'ACK timeout'
    }
}

export class BusyTimeout extends Error {
    constructor() {
        super();
        this.message = 'BUSY timeout'
    }
}

export class ResponseTimeout extends Error {
    constructor() {
        super();
        this.message = 'RESP timeout'
    }
}

export default class Daum8i  {
    
    logger: EventLogger;
    serial: SerialInterface;
    path: string
    
    tcpipConnection: { host:string, port:string}
    port: string;
    settings: any;
    props: any;

    protected sp: SerialPortStream;
    protected connectState: ConnectionState;
    protected connectPromise:Promise<SerialPortStream>
    protected disconnectPromise:Promise<boolean>
    protected writePromise: Promise<void>   
    protected sendCmdPromise: Promise<string>
    protected actualBikeType?:string
    protected recvState: Daum8iCommsState;

    bikeData: any;
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
    
        /* istanbul ignore next*/   
        this.logger = logger || (w?.DEVICE_DEBUG||process.env.DEBUG? DEBUG_LOGGER as EventLogger : new EventLogger('DaumPremium')) ;

        this.isLoggingPaused = false;

        this.connectState = 'Disconnected'

        this.connectPromise = null
        this.recvState = { data: new Queue<ResponseObject>()}
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
        return this.connectState==='Connected' || this.connectState==='Disconnecting';
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

        /* istanbul ignore next*/
        if (w?.DEVICE_DEBUG) {
            console.log('~~~ DaumPremium', e)
        }

    }


    async connect():Promise<boolean> {
        if ( this.isConnected()  && this.sp) {            
            return true;
        }

        // already connecting?, wait until previous connection is finished
        if (this.connectState === 'Connecting') {
            if (this.connectPromise)  {
                try {
                    await this.connectPromise
                }
                catch {
                    // ignore - original caller will catch it
                }
            }
            return this.isConnected()
        }

    
        try {
            this.connectState = 'Connecting'
            this.connectPromise = this.serial.openPort(this.path);

            const port = await this.connectPromise
            this.connectPromise = null;

            if (port!==null) {
                this.connectState = 'Connected';
                this.sp = port;

                this.sp.on('close', this.onPortClose.bind(this));
                this.sp.on('error', this.onPortError.bind(this) );    
                this.sp.on('data',  this.onData.bind(this) );  


                //this.response.on('ACK',this.onACK.bind(this) )
                //this.response.on('NAK',this.onNAK.bind(this))        
    
                return true;   
            }
            else {
                this.connectState = 'Disconnected';
                return false;
            }
        }
        catch {
            this.connectState = 'Disconnected';
            return false;
        }

    }

    async closePort():Promise<boolean> {

        if (!this.sp)
            return true;

        try {  
            await this.flush();    
            await this.serial.closePort(this.path)
            return true;
        }
        catch(err) {
            this.logEvent({message:'could not close ', reason:err.message})
            return false
        }
    }

    cleanupPort() {
        if (this.sp) {
            this.sp.removeAllListeners()
        }
        this.sp = null;

        this.recvState.data.clear()
    }

    async close():Promise<boolean> {
        let isDisconnected = false;

        if (this.disconnectPromise) {
            try {
                isDisconnected = await this.disconnectPromise;
            }
            catch {
                // ignore - original caller will catch
            }
            
            return isDisconnected;
        }

        if (this.connectState==='Disconnected') {
            this.cleanupPort()
            return true;
        }
        else if (this.connectState==='Disconnecting' || this.connectState==='Connected' || this.connectState==='Connecting') {     
            this.connectState='Disconnecting'

            this.disconnectPromise = this.closePort()
            isDisconnected = await this.disconnectPromise

            this.connectPromise  = null
            this.disconnectPromise = null;

            if (isDisconnected)
                this.connectState = 'Disconnected'
            this.cleanupPort()

        }
        return isDisconnected
    }

    async flush():Promise<void> {
        // in case we are currently writing, wait a maximum of 1s to finish writing
        if (this.writePromise) {            
            await this.waitWithTimeout( this.writePromise, 1000)
            this.writePromise = null
        }
    }

    // port was closed
    async onPortClose():Promise<void> {

        if (this.connectState!=='Disconnected' && this.connectState!=='Disconnecting')
            this.logEvent({message:"port closed:",port:this.path});

        this.connectState = 'Disconnected'
        this.cleanupPort();
    }

    async onPortError(error:Error):Promise<void> {
        if (this.connectState==='Disconnecting' || this.connectState==='Disconnected') {
            return;
        }

        this.logEvent({message:"port error:",port:this.path,error:error.message,connected:this.isConnected(), state: this.connectState});


        if (this.isSending()) {
            this.rejectCurrent(error);
        }

        if (this.connectState==='Connected')
            this.close()
    }

    isSending(): boolean {
        return  (this.writePromise!==undefined && this.writePromise!==null) || (this.sendCmdPromise!==null && this.sendCmdPromise!==undefined)
    }

    rejectCurrent(error:Error) {
        this.recvState.data.enqueue({type:'Error', error})
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

        if ( this.recvState.waitingForEnd) {
            cmd = this.recvState.partialCmd;
        }
        
        const bufferData = Buffer.isBuffer(data) ? data: Buffer.from(data,'latin1') 
        
        let incoming = bufferData;
        if (depth===0)
            this.logEvent({message:'sendCommand:RECV',data:hexstr(incoming), state:this.recvState })

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
            if ( c===0x06) {        // 0x06=ACK
                this.recvState.waitingForStart = true;
                this.recvState.waitingForACK = false;
                const remaining = getRemaining()

                this.recvState.data.enqueue( {type:'ACK'})
                if (  remaining && remaining!=='' && depth<MAX_DEPTH) return this.onData(remaining, depth+1)
            }
            else if ( c===0x15) {   // 0x15=NAK
                this.recvState.waitingForStart = true;
                this.recvState.waitingForACK = false;
                const remaining = getRemaining()
                this.recvState.data.enqueue( {type:'NAK'})
                if (  remaining && remaining!=='' && depth<MAX_DEPTH) return this.onData(remaining,depth+1)
            }           
            else if ( c===0x01) {   // 0x01=SOH
                this.recvState.waitingForStart = false;
                this.recvState.waitingForEnd = true;    
            }

            else if ( c===0x17) {   // 0x17=End
                const remaining = getRemaining();

                this.recvState.waitingForEnd = false;   
                const cmdStr = cmd.substring(0,cmd.length-2)
                const checksumExtracted  = cmd.slice(-2)
                const checksumCalculated = checkSum( getAsciiArrayFromStr(cmdStr),[])

                if ( checksumExtracted===checksumCalculated) {
                    const payload = cmd.substring(3,cmd.length-2)   
                    this.recvState.data.enqueue( {type:'Response', data: payload})
                }
                else {
                    const error = new CheckSumError()
                    this.recvState.data.enqueue( {type:'Error', error, data: cmd})

                    this.recvState.waitingForACK = false;
                    this.recvState.waitingForStart = true;   
                    this.recvState.waitingForEnd = false;   
                }
                cmd = '';
                if ( remaining && depth<5)
                    return this.onData( remaining,depth+1);

                
            }
            else {
                if ( this.recvState.waitingForEnd)
                    cmd += String.fromCharCode(c)
            }


        }

        if ( this.recvState.waitingForEnd) {
            this.recvState.partialCmd = cmd;
        }

    }
 

    async waitWithTimeout( promise:Promise<any>, timeout:number, onTimeout?:()=>void) {
        let to;
        
        const toPromise =  (ms) => { 
            return new Promise( resolve => { to = setTimeout(resolve, ms)})
        }

        let res;
        try {
            res = await Promise.race( [promise,toPromise(timeout).then( ()=> { if (onTimeout) onTimeout()})])
        }
        catch {
            // ignore error - the original caller should catch it
        }

        clearTimeout(to)
        return res;        
    }


    async sendDaum8iCommand( command:string, payload:string|any[]=''):Promise<string> {

        const message = buildMessage( command,payload)
        const tsRequest = Date.now();        

        if (this.sendCmdPromise) {
            this.logEvent({message:'sendCommand:waiting',port:this.path,cmd:command,hex:hexstr(message)})

            const onTimeout = () => {
                this.logEvent({message:'sendCommand:busy timeout',port:this.path,cmd:command,hex:hexstr(message),duration: Date.now()-tsRequest}) 
                throw new Error('BUSY timeout')
            }

            this.waitWithTimeout( this.sendCmdPromise, 5000, onTimeout)
            this.sendCmdPromise = null;
        }

        this.sendCmdPromise =  new Promise ( async (resolve,reject) => {
   
            try {    

                this.logEvent({message:"sendCommand:sending:",port:this.path,cmd:command,hex:hexstr(message)});

                if (!this.isConnected()) {
                    const connected = await this.connect()
                    if (!connected) {

                        reject( new Error('not connected'))
                        return
                    }
                }

                let retryCnt = 0
                let ok = false;

                do {
                
                    await this.write( Buffer.from(message));
                    ok = await this.waitForACK()
                    if (!ok) { // NAK 
                        await sleep(1000)

                        // TODO: resend
                        retryCnt++;                        
                    }
                }
                while (!ok && retryCnt<5)

                const res = await this.waitForResponse()
                this.sendCmdPromise = null;

                resolve(res)
        
            }
            catch (err)  {
                this.logEvent({message:"sendCommand:error:",port:this.path,error:err.message,stack:err.stack});
                this.sendCmdPromise = null;

                reject(err)
            }          
    
        });

        return this.sendCmdPromise
    }

    
    onIgnored(payload:string) {
        this.logEvent({message:'onData:IGNORED',port:this.path, data:payload })
    }

    onACK ():void   {                
        //this.logEvent({message:"sendCommand:ACK received:",port:this.path});
        //this.recvState.ACK = { ack:true, ts:Date.now()}                
    }
    onNAK = () => {
        //this.logEvent({message:"sendCommand:NAK received:",port:this.path});
        //this.recvState.ACK = { ack:false, ts:Date.now()}                
    }


    async waitForACK():Promise<boolean> {
        this.recvState.waitingForACK = true;

        const timeout = this.getTimeoutValue()

        let waitingForACK = true;
        let start = Date.now()
        let tsTimeout = start+timeout

        while( waitingForACK && Date.now()<tsTimeout) {
            const response = this.recvState.data.dequeue()
            if (!response) {
                await sleep(5)
            }
            else {
                if (response.type==='ACK' || response.type==='NAK') {
                    this.logEvent({message:`sendCommand:${response.type} received:`,port:this.path});
                    waitingForACK = false;
                    return ( response.type==='ACK' )
                }

            }
        }
        throw new ACKTimeout()
    }



    async waitForResponse():Promise<string> {

        const timeout = this.getTimeoutValue()

        let waitingForResponse = true;
        let start = Date.now()
        let tsTimeout = start+timeout
        let retry = 0;

        while( waitingForResponse && Date.now()<tsTimeout && retry<5) {
            const response = this.recvState.data.dequeue()
            if (!response) {
                await sleep(5)
            }
            else {
                if (response.type==='Response') {
                    this.logEvent({message:`sendCommand:received:`,port:this.path, cmd:response.data});
                    await this.sendACK();

                    waitingForResponse = false;
                    return response.data
                }
                if (response.type==='Error') {
                    this.logEvent({message:`sendCommand:received:ERROR`,port:this.path, error:response.error.message});

                    if (response.error instanceof CheckSumError && retry<5) {
                        await this.sendNAK();
                        retry++;
                    }
                    else {
                        throw response.error
                    }
                }

            }
        }
        throw new ResponseTimeout()

        /*




        let onResponse
        let onError
        let retry = 0;

        const clearListeners = ()=>{
            this.response.off('response',onResponse)
            this.response.off('response.error',onError)   
        }

        const wait = new Promise<string>( async (resolve,reject) => {   

            console.log('~~~wait')

            onResponse = async (payload) =>  {                
                this.logEvent({message:"sendCommand:received",port:this.path, cmd:`${payload} [${hexstr[payload]}]`});

                await this.sendACK();

                clearListeners()
                resolve(payload)
            }
            onError = async (payload, err) => {

                console.log('~~~ Error', payload, err)

                this.logEvent({message:"sendCommand:ERROR",port:this.path,cmd:`${payload} [${hexstr[payload]}]`, error:err.message});
                await this.sendNAK();

                if (err instanceof CheckSumError && retry<5) {
                    retry++;
                }
                else {
                    clearListeners()
                    throw err
                }
            }

            this.response.on('response',onResponse)
            this.response.on('response.error',onError)        
        })

        const timeout = this.getTimeoutValue()        

        return await this.waitWithTimeout( wait,timeout,  ()=> { clearListeners(); throw new Error('RESP timeout')})        


        */
    }

    async portWrite(buffer:Buffer):Promise<void> {        

        if (!this.sp) {
            this.logEvent({message:'write failed', error:'port is not opened'})
            return;
        }

        try {
            await this.sp.write( buffer)                                 
        }
        catch(err) {
            this.logEvent({message:'write failed', error:err.message})
        }    
    }

    async write(buffer:Buffer, ackExpected=true):Promise<void> {

        // previous write still busy? wait for it to finish
        if (this.writePromise) {
            try {
                await this.writePromise                
            } catch {
                // ignore error - original caller will catch it
            }
            this.writePromise = null
        }

        this.writePromise = this.portWrite(buffer)

        if (ackExpected)
            this.recvState.waitingForACK = true;
        
        await this.writePromise
        this.writePromise = null        
    }


    async sendACK() {       
        this.logEvent({message:"sendCommand:sending ACK",port:this.path});
        await this.write( Buffer.from([0x06]), false)
    }

    async sendNAK() {
        this.logEvent({message:"sendCommand:sending NAK",port:this.path});
        await this.write( Buffer.from([0x15]),false)
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
            this.actualBikeType = deviceType;
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
            this.actualBikeType = deviceType;
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


