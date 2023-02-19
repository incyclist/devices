import { EventLogger } from "gd-eventlog";
import { hexstr, Queue } from "../../utils/utils";
import { Command } from "../../types/command";
import EventEmitter from "events";
import { SerialInterface } from "..";
import { ReadlineParser } from '@serialport/parser-readline'

const DEFAULT_RCV_TIMEOUT = 1500;
const DEFAULT_OPEN_TIMEOUT = 3000;

export type  SerialCommsProps = {
    logger?: EventLogger,
    interface: string | SerialInterface
    port: string,
    settings?: any
}

const DEBUG_LOGGER = {
    log: (e,...args) => console.log(e,...args),
    logEvent: (event) => console.log(JSON.stringify(event))
}

export enum SerialCommsState { 
    Idle,
    Connecting,
    Connected,
    Disconnecting,
    Disconnected,
    Error
}

export enum SendState {
    Idle,
    Sending, 
    Receiving
}

const getBikeProps = ( props:SerialCommsProps) => {

    const {port,interface: ifaceName} = props;
    let serial;

    if (ifaceName && typeof ifaceName ==='string') {        
        serial = SerialInterface.getInstance({ifaceName})
    }
    else if (!ifaceName) {
        serial = SerialInterface.getInstance({ifaceName:'serial'})
    }
    else {
        serial = props.interface
    }

    if (!serial)
        throw new Error(`unknonwn interface: ${ifaceName}`)

    const path = `${port}` ;
    return {serial, path}
}



// as we might run in a Browser, SerialPort class will be handed over (not imported directly)
const CRLF = '\r\n'; 

export default class KettlerSerialComms< T extends Command > extends EventEmitter { 
   
    private logger: EventLogger;
    private port: string;
    private sp;
    private queue: Queue<T>;
    private state: SerialCommsState;
    private settings;
    private worker: NodeJS.Timeout;
    private sendState: SendState;
    private currentCmd: T;
    private currentTimeout: NodeJS.Timeout;
    private serial: SerialInterface;
    private openPromise: Promise<boolean>
  
    constructor( opts: SerialCommsProps)  {     
        super();

        const {serial,path} = getBikeProps(opts)


        this.logger =  process.env.DEBUG? DEBUG_LOGGER as EventLogger : (opts.logger || new EventLogger('Kettler'));
        
        this.serial = serial
        this.port   = path

        this.sp     =  undefined;
        this.queue = new Queue();   
        this.state = SerialCommsState.Idle;     
        this.sendState = SendState.Idle;
        this.settings = opts.settings || {}
        this.currentCmd = undefined;
        this.currentTimeout = undefined;
    }

    // getter/setter
    getPort() {
        return this.port;
    }
    setPort(port) {
        this.port = port;
    }

    getLogger() {
        return this.logger;
    }

    isConnected(): boolean {
        return this.state===SerialCommsState.Connected;
    }


    stateIn = ( allowedStates: SerialCommsState[]): boolean => { 
        return allowedStates.indexOf(this.state) >= 0;
    }

    _setState(state: SerialCommsState) {
        this.state = state;
    }
    _setSendState(state: SendState) {
        this.sendState = state;
    }
    _setCurrentCmd(cmd: T) { 
        this.currentCmd = cmd;
    }

    stopCurrentTimeoutCheck() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = undefined;
        }
    }

    onPortOpen() {
        this.logger.logEvent( {message:'port opened', port:this.getPort()});
        this.state = SerialCommsState.Connected;
        this.sendState = SendState.Idle;

        this.stopCurrentTimeoutCheck();

        this.startWorker();        
        this.emit('opened');
    }

    async onPortClose() {
        this.logger.logEvent( {message:'port closed', port:this.getPort()});
        this.stopWorker();

        if ( this.sendState===SendState.Sending ) { 
            // TODO: Wait with timeout until command is processed            
        }

        this.state = SerialCommsState.Disconnected;
        this.sendState = SendState.Idle;
        this.stopCurrentTimeoutCheck();
        this.queue.clear();
        this.emit('closed');

        if (this.sp)
            this.sp.removeAllListeners();
        this.sp = undefined;
    }

    onPortError(err) {

        let ignore = false;

        if ( this.stateIn( [SerialCommsState.Connected, SerialCommsState.Disconnected] )) 
            ignore = true;

        if ( this.state===SerialCommsState.Disconnecting && (err.message==='Port is not open' || err.message==='Writing to COM port (GetOverlappedResult): Operation aborted'))
            ignore = true;

        if ( this.state===SerialCommsState.Connecting && (err.message==='Port is already open' || err.message==='Port is opening'))
            ignore = true;

        if ( !ignore ) {
            this.logger.logEvent({message:"port error:",port:this.getPort(),error:err.message,stack:err.stack,state: this.state});
            
            this.stopCurrentTimeoutCheck();

            if ( this.state===SerialCommsState.Connecting || this.state===SerialCommsState.Disconnecting ) {
                this.state = SerialCommsState.Error;
                if (this.sp)
                    this.sp.removeAllListeners();
                this.sp = undefined;
            }
        }

    }


    
    async open():Promise<boolean> {
        this.logger.logEvent({message:"open()",port:this.getPort()});

        if (this.state===SerialCommsState.Connected)
            return true;

        if ( this.stateIn( [ SerialCommsState.Connecting , SerialCommsState.Disconnecting] )) {
            return this.openPromise;
        }
        
        this.openPromise = new Promise ( async resolve=> {

            const done = ( result:boolean):void => {
                if (this.openPromise) {
                    this.openPromise = undefined;
                    resolve(result)
                }
            }

            try {
                const timeout = this.settings.openTimeout || DEFAULT_OPEN_TIMEOUT;
                this.currentTimeout = setTimeout(()=>{
                    this.logger.logEvent({message:"open() timeout",port:this.getPort()});
                    this.onPortError(new Error("open() timeout"));
                    return done(false)                    
                }, timeout);
    
                const port = await this.serial.openPort(this.port)
                
                if (port) {
                    this.onPortOpen();
    
                    this.sp = port;
                    this.sp.on('close', ()=>{this.onPortClose()});            
                    this.sp.on('error', (error)=>{this.onPortError(error)} );            
                    
                    const parser = this.sp.pipe(new ReadlineParser({delimiter: CRLF}));
                    parser.on('data', (data)=>{this.onData(data)} );
                    return done(true);
                }
                else {
                    this.onPortError( new Error('could not open port'))
                    return done(false);
                }
            }
            catch (err)  {
                this.logger.logEvent({message:"error",fn:'open()',error:err.message});
                this.state = SerialCommsState.Disconnected;
                return done(false)
            }               
    
        })

        return this.openPromise;


    }

    close() {
        this.logger.logEvent( {message:'close()', port:this.getPort()});

        if ( this.stateIn( [SerialCommsState.Idle, SerialCommsState.Disconnected, SerialCommsState.Disconnecting] )) {
            return;
        }

        this.state = SerialCommsState.Disconnecting;
        this.sp.close();
    }


    startWorker() {
        this.worker = setInterval( ()=> {              
            this.sendNextCommand();            
        }, 50 );
    }

    stopWorker() { 
        if (this.worker) {
            clearInterval(this.worker);
            this.worker = undefined;
        }    
    }

    clearTimeout() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = undefined;
        }
    }


    onData(data: string | Buffer)  { 
        this.clearTimeout();

        this.logger.logEvent({message:"sendCommand:receiving:",data:data});
        this.sendState = SendState.Idle;        

        if (typeof data === 'string') {        
            if ( this.currentCmd.onResponse)
                this.currentCmd.onResponse(data);
        }
        else  {
            if ( this.currentCmd.onResponse)
                this.currentCmd.onResponse(data);
        }
        this.currentCmd = undefined;

    }

    write( cmd: Command) { 
        this.sendState = SendState.Sending;

        const {logStr,message,timeout = (this.settings.timeout || DEFAULT_RCV_TIMEOUT)} = cmd;
        const msg = typeof message === 'string' ? message : hexstr(message);

        const onError = (err)=>{ 
            this.logger.logEvent({message:"sendCommand:error:",cmd:logStr,error:err.message,port:this.getPort()});
            if (cmd.onError)
                cmd.onError(err)

            this.sendState = SendState.Idle;
            this.currentCmd = undefined;
            this.stopCurrentTimeoutCheck()
        }

        try {

            this.logger.logEvent({message:"sendCommand:sending:",cmd:logStr, msg, port:this.getPort()});                        
            if (typeof(message) !== 'string') 
                throw new Error('message must be a string');
            
            this.sp.write(msg+CRLF, (err: Error) => {
                this.sendState = SendState.Receiving;
                this.currentCmd = cmd as T;
                if (err)
                    onError(err)
            });
            this.currentTimeout = setTimeout( ()=> {
                if ( this.sendState===SendState.Sending ) {
                    onError( new Error("send timeout"));
                }
                if ( this.sendState===SendState.Receiving ) {
                    onError( new Error("response timeout"));
                }
            }, timeout)



        }
        catch (err)  {
            onError(err)
        }              

    }

    sendNextCommand(): Command | undefined { 
        if ( this.sendState!==SendState.Idle ) {
            return;
        }

        const cmd = this.queue.dequeue();
        if ( cmd )
            this.write(cmd);
    }

    send(cmd: Command) { 
        this.logger.logEvent( {message:'add command to queue', cmd:cmd.logStr,msg:cmd.message, port:this.getPort(), queueSize:this.queue.size()});
        this.queue.enqueue(cmd as T);
    }


}
