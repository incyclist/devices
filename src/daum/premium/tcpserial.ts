import netClass from 'net'

const TIMEOUT_OPEN = 2000;

var __responses = {}

export default class TcpSocketPort {

    callbacks: any;
    enabled: boolean;
    host: string;
    port: number;
    net: any;
    props: any;
    socket: any;

    isOpen: boolean;
    isClosed: boolean;

    path: string;
    outputQueue: Array<any>
    iv: any;

    constructor(props) {
        this.callbacks= {}
        this.isOpen = false;
        
        this.props = props || {}
        this.enabled = this.props.enabled || true;
        this.host = this.props.host || '127.0.0.1'
        this.port = this.props.port || 10000;
        this.net = this.props.net || netClass;
        this.path = `${this.host}:${this.port}`

        if ( this.enabled)
            this.socket = new this.net.Socket();

        this.outputQueue =  [];
        this.iv = undefined;
    }

    flush() {
        //
    }
    
    open() {

        try {
            this.socket.setTimeout(TIMEOUT_OPEN,(e) =>{})
            this.socket.on('timeout',()=>{ this.onTimeout() })
            this.socket.on('connect',()=>{ this.onConnect() })
            this.socket.on('error',(err)=>{ this.onError(err) })

            this.socket.on('ready',()=>{
                this.isOpen=true
                this.emit('open')
            })
            this.socket.connect( this.port, this.host );
        }
        catch (err) {
            this.emit( 'error',err)
        }

    }

    close() {
        this.isOpen = false;
        this.isClosed = true;
        try {
            this.socket.close();
            this.socket.destroy();
            this.socket.on('timeout',()=>{})
            this.socket.on('connect',()=>{})
            this.socket.on('error',()=>{})
            this.socket.on('ready',()=>{})
        }
        catch (err) {
            //
        }
        this.emit('close')

        setTimeout( ()=>{ this.callbacks = {}}, 100);

    }

    onTimeout() {
        if ( this.isClosed)
            return;


        /*
        this.socket.end();
        this.socket.destroy();

        this.socket.setTimeout(TIMEOUT_SEND,(e) =>{})
        this.socket.on('timeout',()=>{})

        this.emit('error', new Error('timeout opening port'))
        */
    }
 
    onConnect() {
        this.isClosed= false;
    }

    onError(err) {
        if ( this.callbacks['error'])
            this.callbacks['error']( err)
    }


    on(event,callback) {

        if ( event==='open' || event==='close' || event==='error' ) {
            this.callbacks[event] = callback;
            return;
        }
        this.socket.on(event,callback)
    }

    emit(event, ...args) {
        if ( event==='open'|| event==='close' || event==='error' ) {
            if ( this.callbacks[event])
                this.callbacks[event](...args)
        }
    }

    write( message) {
        this.socket.write( new Uint8Array(message) )
    }

    unpipe() {
        delete this.callbacks['data'];
        this.socket.unpipe();
    }

    
    pipe( transformer) {

        return this.socket.pipe(transformer)
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
