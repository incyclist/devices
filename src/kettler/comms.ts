import { DeviceProtocol } from "../DeviceProtocol";
import { EventLogger } from "gd-eventlog";
import { hexstr, Queue } from "../utils";
import { Command } from "../types/command";
import EventEmitter from "events";

const DEFAULT_RCV_TIMEOUT = 1500;
const DEFAULT_OPEN_TIMEOUT = 1500;

export type  SerialCommsProps = {
    logger?: EventLogger,
    protocol: DeviceProtocol,
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
    private protocol: DeviceProtocol;
  
    constructor( opts: SerialCommsProps)  {     
        super();

        this.logger =  process.env.DEBUG? DEBUG_LOGGER as EventLogger : (opts.logger || new EventLogger( opts.protocol.getName()));
        this.port   = opts.port || process.env.COM_PORT       
        this.sp     =  undefined;
        this.queue = new Queue();   
        this.state = SerialCommsState.Idle;     
        this.sendState = SendState.Idle;
        this.settings = opts.settings || {}
        this.currentCmd = undefined;
        this.currentTimeout = undefined;
        this.protocol = opts.protocol;
        
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
            this.emit('error', err);
            this.stopCurrentTimeoutCheck();

            if ( this.state===SerialCommsState.Connecting || this.state===SerialCommsState.Disconnecting ) {
                this.state = SerialCommsState.Error;
                this.sp.removeAllListeners();
                this.sp = undefined;
            }
        }

    }


    
    open() {
        this.logger.logEvent({message:"open()",port:this.getPort()});

        if ( this.stateIn( [SerialCommsState.Connected, SerialCommsState.Connecting , SerialCommsState.Disconnecting] )) {
            return;
        }
        

        try {
            const SerialPort = this.protocol.getSerialPort();

            if ( this.sp===undefined ) {
                this.sp = new SerialPort( this.getPort(),this.settings);
                this.sp.on('open', ()=>{this.onPortOpen()} );            
                this.sp.on('close', ()=>{this.onPortClose()});            
                this.sp.on('error', (error)=>{this.onPortError(error)} );            
            }    
            this.state = SerialCommsState.Connecting;

            const parser = this.sp.pipe(new SerialPort.parsers.Readline({delimiter: CRLF}));
            parser.on('data', (data)=>{this.onData(data)} );

            this.sp.open()

            const timeout = this.settings.openTimeout || DEFAULT_OPEN_TIMEOUT;
            this.currentTimeout = setTimeout(()=>{
                this.logger.logEvent({message:"open() timeout",port:this.getPort()});
                this.onPortError(new Error("open() timeout"));
                
            }, timeout);

        }
        catch (err)  {
            this.logger.logEvent({message:"error",fn:'open()',error:err.message});
            this.state = SerialCommsState.Disconnected;
        }               

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
        }

        try {

            this.logger.logEvent({message:"sendCommand:sending:",cmd:logStr, msg, port:this.getPort()});                        
            if (typeof(message) !== 'string') 
                throw new Error('message must be a string');
            
            this.sp.write(msg+CRLF, (err: Error) => {
                this.sendState = SendState.Receiving;
                this.currentCmd = cmd as T;

                if (timeout) {
                    this.currentTimeout = setTimeout( ()=> {
                        if ( this.sendState===SendState.Receiving ) {
                            onError( new Error("response timeout"));
                        }
                    }, timeout)
                }
                if (err)
                    onError(err)
            });

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
        this.logger.logEvent( {message:'send()', cmd:cmd.logStr, port:this.getPort(), queueSize:this.queue.size()});
        this.queue.enqueue(cmd as T);
    }


}
