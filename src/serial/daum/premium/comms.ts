import {ACTUAL_BIKE_TYPE} from "../constants"
import {buildMessage,ascii,bin2esc, esc2bin,parseTrainingData, checkSum, getAsciiArrayFromStr, getPersonData, ReservedCommands, routeToEpp, getBikeType, validatePath, responseLog} from './utils'
import { User } from "../../../types/user";
import { Route } from "../../../types/route";
import { ACKTimeout, CheckSumError, OnDeviceStartCallback, ResponseTimeout } from "./types";
import { sleep } from "../../../utils/utils";
import SerialPortComms from "../../comms";
import { DEFAULT_ACK_TIMEOUT, DEFAULT_TIMEOUT, DS_BITS_ENDLESS_RACE, DS_BITS_OFF, MAX_DATA_BLOCK_SIZE } from "./consts";
import { DaumPremiumCommsState, DaumPremiumRequest, ResponseObject } from "./types";
import { IncyclistBikeData } from "../../..";

export default class Daum8i extends SerialPortComms<DaumPremiumCommsState,DaumPremiumRequest,ResponseObject > {


    validatePath(path:string): string {
        return validatePath(path)
    }
    /* istanbul ignore next */ 
    getDefaultLoggerName():string {
        return 'DaumPremium'
    }

    getAckTimeoutValue() {
        return DEFAULT_ACK_TIMEOUT
    }

    getTimeoutValue() {
        return DEFAULT_TIMEOUT;
    }

    onConnected():void {
        this.sp.on('data',  this.onData.bind(this) );          
    }

    getInitialCommsState(): DaumPremiumCommsState {
        const state = super.getInitialCommsState()
        state.waitingForACK = false;
        state.waitingForStart = false;
        state.waitingForEnd = false;
        return state
    }

    setState(ack:boolean,start:boolean,end:boolean) {
        this.recvState.waitingForACK = ack;
        this.recvState.waitingForStart = start;
        this.recvState.waitingForEnd = end;
    }


    async onData (data:any, depth=0)  {
        let cmd ='';
        const MAX_DEPTH = 5

        if ( this.recvState.waitingForEnd && this.recvState.partialCmd) {
            cmd = this.recvState.partialCmd;
        }
        
        const bufferData = Buffer.isBuffer(data) ? data: Buffer.from(data,'latin1') 
        
        let incoming = bufferData;
        if (depth===0)
            this.logEvent({message:'sendCommand:RECV',data:Buffer.from(incoming).toString('hex') })

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

            if ( c===0x06 && this.recvState.waitingForACK) {        // 0x06=ACK
                this.recvState.waitingForStart = true;
                this.recvState.waitingForACK = false;
                const remaining = getRemaining()

                this.recvState.data.enqueue( {type:'ACK'})
                if (  remaining && remaining!=='' && depth<MAX_DEPTH) return this.onData(remaining, depth+1)
            }
            else if ( c===0x15 && this.recvState.waitingForACK) {   // 0x15=NAK
                this.recvState.waitingForStart = true;
                this.recvState.waitingForACK = false;
                const remaining = getRemaining()
                this.recvState.data.enqueue( {type:'NAK'})
                if (  remaining && remaining!=='' && depth<MAX_DEPTH) return this.onData(remaining,depth+1)
            }           
            else if ( c===0x01  && this.recvState.waitingForStart) {   // 0x01=SOH
                this.recvState.waitingForStart = false;
                this.recvState.waitingForEnd = true;    
            }

            else if ( c===0x17 && this.recvState.waitingForEnd) {   // 0x17=End
                const remaining = getRemaining();

                this.recvState.waitingForEnd = false;   

                if (cmd.length<5) {
                    this.recvState.data.enqueue( {type:'Error', error:new Error('illegal data'), data: cmd})                    
                }
                else {
                    const cmdStr = cmd.substring(0,cmd.length-2)
                    const checksumExtracted  = cmd.slice(-2)
                    const checksumCalculated = checkSum( getAsciiArrayFromStr(cmdStr),[])
    
                    if ( checksumExtracted===checksumCalculated) {
                        const payload = cmd.substring(3,cmd.length-2)   
                        this.recvState.data.enqueue( {type:'Response', cmd:cmd.substring(0,3), data: payload})
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
                
            }
            else {
                if ( this.recvState.waitingForEnd && c!==0x01 && c!==0x06 && c!==0x15 )
                    cmd += String.fromCharCode(c)
            }


        }

        if ( this.recvState.waitingForEnd) {
            this.recvState.partialCmd = cmd;
        }

    }

    async send( request:DaumPremiumRequest):Promise<ResponseObject> {
        const {command,payload=''} = request
        

        const message = buildMessage( command,payload)

        let logPayload 
        if ( request.isBinary) {
            logPayload =  {
                port:this.path,
                cmd: request.logString||'BinaryCommand',
            }

        }
        else {
            logPayload =  {
                port:this.path,
                cmd: `${request.logString} (${command})`||command
                
            }
        }

        await this.ensurePrevCmdFinish(logPayload);

        this.sendCmdPromise =  new Promise ( async (resolve,reject) => {
   
            try {    
                this.logEvent({message:"sendCommand:sending:",...logPayload, hex:Buffer.from(message).toString('hex')});

                await this.ensureConnection()

                let retryCnt = 0
                let ok = false;

                do {

                    if(retryCnt>0)
                        this.logEvent({message:"sendCommand:resending:",...logPayload, hex:Buffer.from(message).toString('hex')});
                    await this.write( Buffer.from(message));
                  
                    ok = await this.waitForACK()
                    this.logEvent({message:`sendCommand:${ok?'ACK':'NAK'} received:`,...logPayload});

                    if (!ok) { // NAK 
                        await sleep(100)

                        retryCnt++;                        
                    }
                }
                while (!ok && retryCnt<5)  // we have to wait 11s for ACK

                if (!ok) {
                    this.sendCmdPromise = null;
                    throw new Error('ACK Error')
                }
                    

                let checksumFailure = false
                let retry=0
                let response;
                do {
                    response = await this.waitForResponse()

                    if (response.type==='Response') {
                        this.logEvent({message:`sendCommand:received:`,...logPayload, response: request.isBinary ? Buffer.from(response.data).toString('hex'): responseLog(response.data) });
                        await this.sendACK(logPayload);

                        this.sendCmdPromise = null;
                        return resolve(response)
                    }
    
                    if (response.type==='Error') {
                        this.logEvent({message:`sendCommand:received:ERROR`,...logPayload, error:response.error.message});
    
                        if (response.error instanceof CheckSumError && retry<5) {
                            checksumFailure = true
                            await this.sendNAK(logPayload);
                            retry++;
                        }
                        else {
                            this.sendCmdPromise = null;
                            throw response.error
                        }
                    }
    
                }
                while(checksumFailure && retry<5)

                this.sendCmdPromise = null;
                return response
        
            }
            catch (err)  {
                this.logEvent({message:"sendCommand:error:",...logPayload,error:err.message,stack:err.stack});
                this.sendCmdPromise = null;

                reject(err)
            }          
    
        });

        return this.sendCmdPromise
        
    }

    async sendStrCommand( logString:string, command:string, payload:string|Uint8Array=''):Promise<string> { 
        const response = await  this.send( {logString,command,payload,isBinary:false})
        return response.data
    }

    async sendBinaryCommand( logString:string,  command:string, payload:string|Uint8Array=''):Promise<string> { 
        const response = await  this.send( {logString, command,payload,isBinary:true})
        return response.data
    }

    
    async waitForACK():Promise<boolean> {
        
        this.setState(true,false,false) 
        const timeout = this.getAckTimeoutValue()

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
                    waitingForACK = false;
                    return ( response.type==='ACK' )
                }

            }
        }
        throw new ACKTimeout()
    }



    async waitForResponse():Promise<ResponseObject> {

        const timeout = this.getTimeoutValue()

        let waitingForResponse = true;
        let start = Date.now()
        let tsTimeout = start+timeout

        while( waitingForResponse && Date.now()<tsTimeout ) {
            const response = this.recvState.data.dequeue()
            if (!response) {
                await sleep(5)
            }
            else {
                return response

            }
        }
        throw new ResponseTimeout()
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


    async sendACK(logPayload) {       
        this.logEvent({message:"sendCommand:sending ACK",...logPayload});
        await this.write( Buffer.from([0x06]), false)
    }

    async sendNAK(logPayload) {
        this.logEvent({message:"sendCommand:sending NAK",...logPayload});
        await this.write( Buffer.from([0x15]),false)
    }



    /*
    ====================================== Commands ==============================================
    */

    async getProtocolVersion():Promise<string> {
        const data = await this.sendStrCommand ( 'getProtocolVersion', 'V00' )
        const version = data.substring(0,1)+'.'+ data.substring(1)
        return(version)    
    }


    async getDashboardVersion():Promise<string> {
        return this.sendStrCommand('getDashboardVersion','V70');        
    }

    async getDeviceType():Promise<string> {
        const str = await this.sendStrCommand('getDeviceType','Y00')
       
        let deviceType;
        if ( str === '0' ) deviceType= 'run';
        else if ( str === '2' ) deviceType= 'bike';
        else if ( str === '7' ) deviceType= 'lyps';
        else 
            throw( new Error(`unknown device type ${typeof str ==='string' ? str: ascii(str)}`))
        return deviceType;
    }


    async getActualBikeType():Promise<string> {
        const str = await this.sendStrCommand('getActualBikeType','M72')
        let deviceType;
        if ( str === '0' ) deviceType= ACTUAL_BIKE_TYPE.ALLROUND;
        else if ( str === '1' ) deviceType= ACTUAL_BIKE_TYPE.RACE;
        else if ( str === '2' ) deviceType= ACTUAL_BIKE_TYPE.MOUNTAIN;
        else {
            throw( new Error(`unknown actual device type ${ typeof str ==='string' ? ascii(str.charAt(0)): str }`))
        }
        this.actualBikeType = deviceType;
        return deviceType
    }

    async setActualBikeType( actualBikeType):Promise<string> {

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
 
        const str = await this.sendStrCommand('setActualBikeType',`M72${bikeType}`)
    
        let deviceType;
            if ( str === '0' ) deviceType= ACTUAL_BIKE_TYPE.ALLROUND;
            else if ( str === '1' ) deviceType= ACTUAL_BIKE_TYPE.RACE;
            else if ( str === '2' ) deviceType= ACTUAL_BIKE_TYPE.MOUNTAIN;
            else 
                throw( new Error('unknown actual device type'))
        this.actualBikeType = deviceType;
        return deviceType
        
    }

    async getTrainingData():Promise<IncyclistBikeData> {
        const data = await this.sendStrCommand('getTrainingData','X70')
        return parseTrainingData(data); 
   
    }

    async setLoadControl( enabled:boolean ):Promise<boolean> {
        const val = enabled? ascii('1'): ascii('0');
        const data = await  this.sendStrCommand('setLoadControl','S20',new Uint8Array([val]))
        const res = data==='1';
        return res
    }

    async getLoadControl():Promise<boolean> {
        const data = await this.sendStrCommand('getLoadControl','S20')       
        const res = data==='1';
        return res            
    }

    async setPower( power:number|string ):Promise<number> {
        const powerStr = typeof power === 'string' ? Number.parseFloat(power).toFixed(2) : power.toFixed(2)
        const str = await this.sendStrCommand('setPower',`S23${powerStr}`)
        return  parseInt(str);
    }

    async getPower():Promise<number> {
        const str = await this.sendStrCommand('getPower','S23')
        return  parseInt(str);
    }

    async setGear(gear:number):Promise<number> {
        const str = await this.sendStrCommand('setGear',`M71${gear}`)
        return parseInt(str);       
    }

    async getGear():Promise<number> {
        const str = await this.sendStrCommand('getGear','M71')
        return parseInt(str);
    }


    async sendReservedDaum8iCommand( logString:string, command:ReservedCommands, data?:Buffer):Promise<Uint8Array>  {
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

        const res = await this.sendBinaryCommand(logString||'ReservedCommand', 'M70', bin2esc(cmdData))
        const resData = Uint8Array.from(res, x => x.charCodeAt(0));
        const cmd = esc2bin(resData);

        return cmd;
        
    }



    async setPerson( person:User ): Promise<boolean> {
        const {sex,age,length,weight} = person;
        
        /* istanbul ignore next*/
        const logStr = `setPerson(${sex===undefined?'':sex},${age===undefined?'':age},${length===undefined?'':length},${weight===undefined?'':length})`;
        const res = await this.sendReservedDaum8iCommand( logStr, ReservedCommands.PERSON_SET, getPersonData(person))
        
            const buffer = Buffer.from(res);
            const success = buffer.readInt16LE(0) === ReservedCommands.PERSON_SET
            this.logEvent( {message:`${logStr} response`, success })

            if (!success) 
                throw new Error('Illegal Response' )
            return true;
        
    }

    async programUploadInit():Promise<boolean> {        
        const res = await  this.sendReservedDaum8iCommand('programUploadInit()', ReservedCommands.PROGRAM_LIST_BEGIN)
        
        const buffer = Buffer.from(res);
        const success = buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_BEGIN
        this.logEvent( {message:'programUploadInit() response',success})
        if (!success) 
            throw new Error('Illegal Response' )
        return true;
        
    }

    async programUploadStart(bikeType:string, route?: Route):Promise<Uint8Array> {
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
       
        const res =await this.sendReservedDaum8iCommand('programUploadStart()', ReservedCommands.PROGRAM_LIST_NEW_PROGRAM,payload)
        const buffer = Buffer.from(res);
        if ( buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_NEW_PROGRAM) {
            this.logEvent( {message:'programUploadStart() response', success:true})
            return epp
        }
        this.logEvent( {message:'programUploadStart() response', success:false})
        throw new Error('Illegal Response' )
    }

    

    async programUploadSendBlock(epp: Uint8Array, offset: number):Promise<boolean> {
        
        const remaining = epp.length - offset;
        if (remaining<=0)
            return Promise.resolve(true);
        
        const size = remaining > MAX_DATA_BLOCK_SIZE? MAX_DATA_BLOCK_SIZE: remaining;

        const payload = Buffer.alloc(size+8);

        payload.writeInt32LE(size,0);              // size
        payload.writeInt32LE(offset,4);            // offset
        const chunk = Buffer.from(epp.slice(offset,offset+size));
        chunk.copy(payload,8);

        
        const logStr = `programUploadSendBlock(${offset},${size})`
        const res = await this.sendReservedDaum8iCommand( logStr, ReservedCommands.PROGRAM_LIST_CONTINUE_PROGRAM, payload)
        const buffer = Buffer.from(res);
        let success = buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_CONTINUE_PROGRAM  ;

        success = success && (buffer.readInt16LE(2) === 1);
        success = success && (buffer.readInt8(4) === 1);
        this.logEvent( {message:`${logStr} response`, data:buffer.toString('hex') /*, check1:buffer.readInt16LE(2),check2:buffer.readInt8(4)*/ })

        if (!success) throw new Error('Illegal Response' )
        return true;;

    }


    async programUploadDone():Promise<boolean> {
        
        const res =  await this.sendReservedDaum8iCommand( 'programUploadDone()', ReservedCommands.PROGRAM_LIST_END)        
        const buffer = Buffer.from(res);
        const success =  buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_END;
        this.logEvent( {message:'programUploadDone() response', success})

        if (!success) throw new Error('Illegal Response' )
        return true;;
        
    }



    async startProgram( programId: number = 1):Promise<boolean> {
        const payload = Buffer.alloc(2);

        payload.writeInt16LE(programId,0);
        
        const logStr = `startProgram(${programId})`
        const res = await  this.sendReservedDaum8iCommand( logStr,ReservedCommands.PROGRAM_LIST_START, payload)
        
        const buffer = Buffer.from(res);
        const success =  buffer.readInt16LE(0) ===ReservedCommands.PROGRAM_LIST_START
        this.logEvent( {message:'startProgram() request', programId, success})
        
        if (!success) throw new Error('Illegal Response' )
        return true;;        
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

                if (epp.length===0)
                    done=true;

                while (success && !done ) {
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
                onStatusUpdate(0,0);
                return await this.programUploadDone()
            }
    
        }
        catch ( err ) {
            this.logEvent({message:'error', fn:'programUpload', error:err.message, stack:err.stack})
            return false;
        }       
    }


}