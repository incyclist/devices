import { BindingPortInterface, OpenOptions, PortStatus, PortInfo, SetOptions, UpdateOptions, BindingInterface } from "@serialport/bindings-interface";
import { EventLogger } from 'gd-eventlog';
import { networkInterfaces } from 'os';
import net from 'net'


const DEFAULT_TIMEOUT = 3000
export interface TCPOpenOptions extends OpenOptions {
    timeout? : number
}

export declare interface TCPBindingInterface<T extends BindingPortInterface = BindingPortInterface, R extends OpenOptions = OpenOptions, P extends PortInfo = PortInfo> extends BindingInterface<TCPPortBinding,TCPOpenOptions> {
    list(port?:number, excludeList?:string[]): Promise<P[]>;
    open(options: TCPOpenOptions): Promise<TCPPortBinding>
}

//export type TCPBindingInterface = BindingInterface<TCPPortBinding,TCPOpenOptions>


function resolveNextTick() {
    return new Promise<void>(resolve => process.nextTick(() => resolve()))
}

export class CanceledError extends Error {
    canceled: true
    constructor(message: string) {
      super(message)
      this.canceled = true
    }
}

export function scanPort( host:string,port:number): Promise<boolean> {
    return new Promise( (resolve) => {
        try {
            const socket = new net.Socket();

            const cleanup = ()=> {
                try {
                    socket.destroy();
                }
                catch(err) {}
                socket.removeAllListeners()
            }

            socket.setTimeout(1000)
            socket.on('timeout' ,()     =>{ resolve(false);;cleanup(); })
            socket.on('error'   ,(err)  =>{ resolve(false);cleanup(); })
            socket.on('ready'   ,()     =>{ resolve(true);cleanup(); })

            socket.connect( port, host );
        }
        catch (err) {
            // just in case - this code should never be reached
            resolve(false)
        }
    
    })
}

//async function scanPort1(host,port) { console.log('checking',host, port); return true}

export function scanSubNet( sn:string,port:number,excludeHosts?:string[]  ):Promise<string[]> {
    const range = [];
    for (let i=1;i<255;i++) 
        if (!excludeHosts || !excludeHosts.includes(`${sn}.${i}`)) range.push(i)

    return Promise.all( range.map( j => scanPort(`${sn}.${j}`,port).then( success => success ? `${sn}.${j}`: null).catch() ))        
        .then( hosts => hosts.filter( h => h!==null)) 
        .catch()
}

export function getSubnets() {
    const nets = networkInterfaces();
    const results = []

    const names = Object.keys(nets);
    names.forEach( name => {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    })

   
    const address = Object.keys(networkInterfaces())
    // flatten interfaces to an array
    .reduce((a, key) => [
        ...a,
        ...networkInterfaces()[key]
    ], [])
    // non-internal ipv4 addresses only
    .filter(iface => iface.family === 'IPv4' && !iface.internal && iface.netmask==='255.255.255.0')
    .map( iface => { 
        const parts = iface.address.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`    
    })

    const subnets  = address.filter((x, i) => i === address.indexOf(x))
    subnets.push('127.0.0')
    return subnets;
}



  
export const TCPBinding: TCPBindingInterface = { 

    

    /**
     * Provides a list of hosts that have port #PORT opened
     */
    async list( port?:number , excludeList?:string[]): Promise<PortInfo[]> {

        

        if (!port)
            return []


        

        const subnets = getSubnets()     
        let hosts:string[] = [];

        const excludeHosts = excludeList.map( e=>  e && e.includes(':') ? e.split(':')[0] : e)

        await Promise.all( 
            subnets.map( sn=> scanSubNet(sn,port, excludeHosts).then( found=> { hosts.push(...found) }))             
        )
            
        return hosts.map( host => ({
            path:`${host}:${port}`,
            manufacturer: undefined,
            locationId: undefined,
            pnpId: undefined,
            productId: undefined,
            serialNumber: undefined,
            vendorId: undefined
        }))
        
    },

    /**
     * Opens a connection to the serial port referenced by the path.
     */
    async open(options: TCPOpenOptions): Promise<TCPPortBinding> {

        const asyncOpen = ():Promise<net.Socket> =>  {
            return new Promise( (resolve,reject) => {

                let host,port;

                if (!options.path)
                    return reject( new TypeError('"path" is not valid'))

                try {
                    const res = options.path.split(':')
                    if (res.length!==2)
                        return reject( new TypeError('"path" is not valid'))
                    host = res[0]
                    port = Number(res[1])
                    if (isNaN(port))
                        return reject( new TypeError('"path" is not valid'))
                }
                catch(err) {
                    return reject( new TypeError('"path" is not valid'))
                }


                const socket = new net.Socket();
                socket.setTimeout(options.timeout||DEFAULT_TIMEOUT)

                socket.once('timeout',()=>{ reject(new Error('timeout'))})
                socket.once('error',(err)=>{ reject(err)})
                socket.once('connect',()=>{ resolve(socket)})
                //socket.once('ready',()=>{})

                socket.connect(port,host)
        
            } )
        }

        // This all can be actually ignored for the TCPBinding, but as they all a re Required, I need to setup some defaults
        const openOptions: Required<OpenOptions> = {
            dataBits: 8,
            lock: true,
            stopBits: 1,
            parity: 'none',
            rtscts: false,
            xon: false,
            xoff: false,
            xany: false,
            hupcl: true,
            ...options
        }

        const socket = await asyncOpen()

        return new TCPPortBinding(socket,openOptions)

    }

}


export class TCPPortBinding implements BindingPortInterface  {
    openOptions: Required<OpenOptions>;
    socket:any;
    logger:EventLogger;
    writeOperation: null | Promise<any>;
    data: Buffer;
    private pendingRead: null | ((err: null | Error) => void)
    private onDataHandler = this.onData.bind(this)
    private onErrorHandler = this.onError.bind(this)
    private onTimeoutHandler = this.onTimeout.bind(this)
    private onCloseHandler = this.onClose.bind(this)

    constructor(socket:net.Socket, options: Required<OpenOptions>) {

        this.logger = new EventLogger('TCPPort')
        this.socket = socket
        this.openOptions = options
        this.pendingRead = null
        this.writeOperation = null;
        this.data = null

        this.socket.removeAllListeners();      
        this.socket.on('data', this.onDataHandler)
        this.socket.on('error',this.onErrorHandler )
        this.socket.on('close',this.onCloseHandler)
        this.socket.on('end', this.onCloseHandler)
        this.socket.on('timeout',this.onTimeoutHandler)
    }

    get isOpen() {
        return this.socket!==null
    }

    onData(data:Buffer) {
        if (!this.data) this.data = Buffer.alloc(0)
        const buffer = Buffer.from(data)
        this.data = Buffer.concat([this.data,buffer])

        if (this.pendingRead) {
            process.nextTick(this.pendingRead)
            this.pendingRead = null
        }
    }

    onError(err:Error) {
        this.logger.logEvent({message:'Port Error', error:err.message})
        if (this.pendingRead) {
            this.pendingRead(err)
            this.socket = null;
        }

    }

    onTimeout() {
        this.logger.logEvent({message:'Port Timeout'})
        if (this.pendingRead) {
            this.pendingRead( new Error('timeout'))            
        }
        
    }

    onClose() {
        this.close()
    }

    
    async close(): Promise<void> {
        if (!this.isOpen)    
            return
        // reset data
        this.data = Buffer.alloc(0);


        const close = async () => {

            return new Promise( done => {
                const socket = this.socket;

                //socket.removeAllListeners();
                socket.on('error',()=>{ done(false) })            
                socket.on('close',()=>{ socket.removeAllListeners(); done(true) })            

                socket.destroy()
    
            })
    
        }
        
        const closed = await close();

        if (closed) {
            this.socket = null;
            if (this.pendingRead) {
                this.pendingRead(new CanceledError('port is closed'))          
            }
    
        }


            
    }


    async read(buffer: Buffer, offset: number, length: number): Promise<{ buffer: Buffer; bytesRead: number; }> {

        if (!this.isOpen) {
            throw new Error('Port is not open')
        }
        if (!Buffer.isBuffer(buffer)) {
            throw new TypeError('"buffer" is not a Buffer')
        }
      
        if (typeof offset !== 'number' || isNaN(offset)) {
            throw new TypeError(`"offset" is not an integer got "${isNaN(offset) ? 'NaN' : typeof offset}"`)
        }
      
        if (typeof length !== 'number' || isNaN(length)) {
            throw new TypeError(`"length" is not an integer got "${isNaN(length) ? 'NaN' : typeof length}"`)
        }
      
        if (buffer.length < offset + length) {
            throw new Error('buffer is too small')
        }
      
        await resolveNextTick()

        if (!this.data || this.data.length===0) {
            return new Promise((resolve, reject) => {
                this.pendingRead = err => {

                    
                    if (err) {
                        if (err.message==='timeout') {
                            resolve( {buffer:Buffer.from([]),bytesRead:0})
                            return;
                        }
                        return reject(err)
                    }
                    this.read(buffer, offset, length).then(resolve, reject)
                }
            })
                          
        }
            
        const lengthToRead = length===65536 ? this.data.length : length;

        const toCopy = this.data.slice(0, lengthToRead)
        const bytesRead = toCopy.copy(buffer,offset)
        this.data = this.data.slice(lengthToRead)
        this.pendingRead = null;

        return ({buffer,bytesRead})
        
    }

    write(buffer: Buffer): Promise<void> {

        if (!this.isOpen) {
            throw new Error('Port is not open')
        }

        this.writeOperation = new Promise<void> ( async (resolve,reject)=>{
            await resolveNextTick()

            try {
                this.socket.write(buffer,()=>{
                    resolve()
                })    
            }
            catch(err) {
                this.onError(err)
            }
            
        })

        
        return this.writeOperation;
    }


    async update(options: UpdateOptions): Promise<void> {
        await resolveNextTick()
    }

    async set(options: SetOptions): Promise<void> {
        
        await resolveNextTick()
    }
    
    async get(): Promise<PortStatus> {
        if (!this.isOpen) {
          throw new Error('Port is not open')
        }
        await resolveNextTick()
        return {
          cts: true,
          dsr: false,
          dcd: false,
        }
    }    

    async getBaudRate(): Promise<{ baudRate: number; }> {
        return {baudRate:9600};
    }

    async flush(): Promise<void> {        
        if (!this.isOpen ) {
          throw new Error('Port is not open')
        }
        await resolveNextTick()
        this.data = Buffer.alloc(0)
    }
    
      async drain(): Promise<void> {
        if (!this.isOpen) {
          throw new Error('Port is not open')
        }
        await resolveNextTick()
        await this.writeOperation
      }

}