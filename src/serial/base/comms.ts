import { EventLogger } from "gd-eventlog";
import SerialInterface from "./serial-interface";
import { SerialCommProps } from "../types";
import { SerialPortStream } from "@serialport/stream";
import { DEBUG_LOGGER } from "../daum/premium/utils";
import { Queue, waitWithTimeout } from "../../utils/utils";
export type ConnectionState = 'Connecting' | 'Connected' | 'Disconnected' | 'Disconnecting'

export type Request = {
    logString?: string
    isBinary?: boolean
}

export type Response = {

}


export interface CommsState {
    data?: Queue<Response>
}

const DEFAULT_BUSY_TIMEOUT = 5000

export default class SerialPortComms<T extends CommsState, C extends Request, R extends Response>  {
    
    logger: EventLogger;
    serial: SerialInterface;
    
    protected path: string    
    protected props: SerialCommProps;
    protected sp: SerialPortStream;
    protected connectState: ConnectionState;
    protected connectPromise:Promise<SerialPortStream>
    protected disconnectPromise:Promise<boolean>
    protected writePromise: Promise<void>   
    protected sendCmdPromise: Promise<R>
    protected actualBikeType?:string
    protected recvState: T;
    protected isLoggingPaused: boolean;


    /*
    ====================================== Comstructor ==============================================
    */
    constructor( props: SerialCommProps) {
        
        this.props  = props;

        const {logger, serial, path} = props;

        this.serial = serial;
        this.path = this.validatePath(path);
        const w = global.window as any
    
        /* istanbul ignore next*/   
        this.logger = logger || (w?.DEVICE_DEBUG||process.env.DEBUG? DEBUG_LOGGER as EventLogger : new EventLogger(this.getDefaultLoggerName())) ;     

        this.resetState()
        
    }
    /*
    ====================================== Statics ==============================================
    */
    getBusyTimeout() {
        return DEFAULT_BUSY_TIMEOUT
    }


    getDefaultLoggerName():string {
        return 'Serial'
    }

    getInitialCommsState():T {
        return { data: new Queue<R>() } as unknown as T
    }

    validatePath(path:string):string {
        return path
    }

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

    pause() {
        this.pauseLogging()
    }

    resume() {
        this.resumeLogging()
    }


    logEvent(e) {
        if(this.isLoggingPaused)
            return;

        this.logger.logEvent(e)
        const w = global.window as any

        /* istanbul ignore next*/
        if (w?.DEVICE_DEBUG) {
            console.log(`~~~ ${this.getDefaultLoggerName()}`, e)
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
                this.onConnected()
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

    onConnected():void {
    }

    portFlush():void {
        if (this.sp)            
            this.sp.flush()
    }

    portPipe(destination, options?) {
        if (this.sp)            
            return this.sp.pipe(destination,options)
    }
    portUnpipe(destination?):void {
        if (this.sp)            
            this.sp.unpipe(destination)
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

    

    resetState(isDisconnected=true) {        
        this.isLoggingPaused = false;
        this.recvState = this.getInitialCommsState()
        this.connectPromise = null;
        this.disconnectPromise = null;
        this.writePromise = null;
        this.sendCmdPromise = null;
        if (isDisconnected)
            this.connectState = 'Disconnected'

    }


    cleanupPort(isDisconnected=true) {
        if (this.sp) {
            this.sp.removeAllListeners()
        }
        this.sp = null;

        this.resetState(isDisconnected)

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
            if (isDisconnected) {
                this.connectState='Disconnected'
                this.logEvent({message:"port closed:",port:this.path});
            }
                        


            this.cleanupPort(isDisconnected)

        }
        return isDisconnected
    }

    async flush():Promise<void> {
        // in case we are currently writing, wait a maximum of 1s to finish writing
        if (this.writePromise) {            
            await waitWithTimeout( this.writePromise, 1000)
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

    getTimeoutValue():number {
        throw new Error('method not implemented')
    }


    /*
        Daum 8i Commands
    */
    async onData (data, depth=0)  {
    }
 

    async send( command:C):Promise<R> {
        throw new Error('method not implemented')
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

    async portRead(size?:number) { 
        if (!this.sp) {
            this.logEvent({message:'write failed', error:'port is not opened'})
            return;
        }

        return await this.sp.read(size)
    }

    async write(buffer:Buffer):Promise<void> {

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

        await this.writePromise
        this.writePromise = null        
    }


    async ensurePrevCmdFinish(logPayload: any) {
        if (this.sendCmdPromise) {
            const tsRequest = Date.now()

            this.logEvent({ message: 'sendCommand:waiting:', ...logPayload });
            let busyTimedOut = false;

            const onTimeout = () => {
                this.logEvent({ message: 'sendCommand:error:', ...logPayload, error: 'BUSY timeout', duration: Date.now() - tsRequest });
                busyTimedOut = true;
            };

            await waitWithTimeout(this.sendCmdPromise, this.getBusyTimeout(), onTimeout);
            this.sendCmdPromise = null;

            if (busyTimedOut)
                throw new Error('BUSY timeout');
        }
    }

    async ensureConnection() {
        if (!this.isConnected()) {
            const connected = await this.connect()
            if (!connected) {
                throw new Error('not connected')
            }
        }
    }


}