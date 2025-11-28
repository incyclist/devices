import EventEmitter from "events";
import { PortInfo, BindingInterface } from "@serialport/bindings-interface";
import { SerialPortStream } from '@serialport/stream'
import SerialPortProvider from "./serialport";
import { SerialDeviceSettings,SerialScannerProps, PortMapping, SerialInterfaceProps  } from "../types";
import { DeviceSettings, IncyclistInterface } from "../../types";

import { TCPBinding } from "../bindings/tcp";
import { EventLogger } from "gd-eventlog";
import { sleep } from "../../utils/utils";
import SerialAdapterFactory from "../factories/adapter-factory";

import { SinglePathScanner } from "./serial-scanner";


const DEFAULT_SCAN_TIMEOUT = 10000;
const MAX_PARALLEL_SCANS = 5;

export default class SerialInterface  extends EventEmitter implements IncyclistInterface { 

    ifaceName: string;
    binding: BindingInterface;
    ports: PortMapping[]
    isScanning: boolean;
    isStopScanRequested: boolean;
    scanEvents: EventEmitter;
    logger: EventLogger;
    toScan: NodeJS.Timeout;
    connected: boolean

    inUse: string[]     // Ports already in use
    

    static _instances: SerialInterface[] = []    

    static getInstance(props:SerialInterfaceProps) {
        const {ifaceName, binding,logger} = props;

        let instance = SerialInterface._instances.find( i => i.ifaceName===ifaceName)
        if (!instance) {
            if (binding)
                instance = new SerialInterface(props)
            else {
                instance = new SerialInterface({ifaceName,binding:SerialPortProvider.getInstance().getBinding(ifaceName),logger})
                if (instance)
                    SerialInterface._instances.push(instance)
            }
        }
        return instance
    }

    static _add( instance: SerialInterface) {
        let existingIdx = SerialInterface._instances.findIndex( i => i.ifaceName===instance.ifaceName)
        if (existingIdx!==-1) 
            SerialInterface._instances[existingIdx] = instance
        else 
            SerialInterface._instances.push(instance)
    }
    
    constructor(props:SerialInterfaceProps) {
        super();

        const {ifaceName,binding} = props;
        this.ifaceName = ifaceName;
        this.binding = undefined;
        this.ports = []
        this.inUse = []
        this.isScanning = false;
        this.isStopScanRequested = false;
        this.scanEvents = new EventEmitter()
        this.scanEvents.setMaxListeners(100)
        
        this.logger = props.logger || new EventLogger( `Serial:${ifaceName}`)
        this.connected = false;
        
        this.logEvent({message:'new serial interface', ifaceName})

        if (binding) {
            this.setBinding(binding)
        }
        SerialInterface._add(this)
    }

    logEvent(event) {
        if ( this.logger) {
            this.logger.logEvent(event)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
    
        if (w?.DEVICE_DEBUG||process.env.SERIAL_DEBUG||process.env.ANT_DEBUG||process.env.BLE_DEBUG) {
            console.log( '~~~ Serial', event)
        }

    }

    setBinding(binding: BindingInterface):void {
        this.binding = binding;
        SerialPortProvider.getInstance().setBinding(this.ifaceName,binding)
    }

    getName():string {
        return this.ifaceName
    }

    isConnected(): boolean {
        // serial interface can always be used
        return this.connected;
    }   

    setInUse(path:string):void {
        this.logEvent({message:'block port for further scans', port:path})
        if (!this.inUse.includes(path))
            this.inUse.push(path)
    }

    releaseInUse(path:string):void {
        if (this.inUse.includes(path)) {
            this.logEvent({message:'re-enable port for further scans', port:path})
            const idx = this.inUse.findIndex( r => r===path)
            
            this.inUse.splice(idx,1)            
        }
    }


    // connect just verifies that the Binding is valid - no ports are yet opened
    async connect(): Promise<boolean> {
        this.logEvent({message:'connecting',interface:this.ifaceName})              

        const binding = SerialPortProvider.getInstance().getBinding(this.ifaceName)
        if (!binding || !this.binding) {
            this.connected = false;
            this.logEvent({message:'connecting error',interface:this.ifaceName, reason:'no binfing found'})              

            return false;
        }

        try {
            const SerialPort = this.binding;
            await SerialPort.list()
            this.connected = true;
            return true;
        }
        catch(err) {
            this.logEvent({message:'connecting error',interface:this.ifaceName, reason:err.message})              

            this.connected = false;
            return false;
        }
    }

    async disconnect(): Promise<boolean> {
        this.connected = false;
        return true;
    }

    async openPort(path:string): Promise< SerialPortStream|null> {
        this.logEvent({message:'opening port',port:path})              
        const existing = this.ports.findIndex( p=> p.path===path)
        if (existing!==-1) {
            const port = this.ports[existing].port;
            if (port.isOpen) {
                this.logEvent({message:'opening port - port already exists',port:path})
                return port;
            }
            else {
                this.ports.splice(existing,1)
            }
        }

        const port = SerialPortProvider.getInstance().getSerialPort(this.ifaceName, {path});
        if (!port) {            
            this.logEvent({message:'opening port - port does not exist',port:path})
            return null;
        }

        return new Promise( (resolve) => {
            port.once('error',(err)=>{ 
                this.logEvent({message:'error', path, error:err.message||err, stack:err.stack})
                port.removeAllListeners()
                resolve(null); 
            })
            port.once('open',()=>{
                this.logEvent({message:'port opened',path})
                port.removeAllListeners()
                this.ports.push({path,port})
                resolve(port); 
            })
            port.open()
    
        })
    }

    async closePort(path:string): Promise<Boolean> {
        this.logEvent( {message:'closing port', port:path})
        const existing = this.ports.findIndex( p=> p.path===path)
        if (existing===-1)
            return true;

        
        const port = this.ports[existing].port;
        if (!port.isOpen)
            return true;
        
        port.on('error',()=>{})

        try {
            port.flush();
            await port.drain();
        }
        catch {}

        return new Promise( resolve=> {
            port.close( err=> {
                if (!err) {
                    this.ports.splice(existing,1)
                    port.removeAllListeners();  
                    resolve(true)
                }
                resolve(false)
            });
        })
        

    }

    

    async scan(props:SerialScannerProps):Promise< SerialDeviceSettings[]> {
        if (this.isScanning)
            return [];

        if (!this.isConnected())
            await this.connect()

        const binding = SerialPortProvider.getInstance().getBinding(this.ifaceName)
        if (!binding || !this.binding)
            return [];
        
        const {port,timeout=DEFAULT_SCAN_TIMEOUT} = props as any

        let paths:PortInfo[];
        const detected:SerialDeviceSettings[] = [];

        let timeOutExpired = false;
        let toExpiresAt = Date.now()+timeout;

        if (timeout)  {
            this.toScan = setTimeout(()=>{
                timeOutExpired = true;
                this.scanEvents.emit('timeout')
            },timeout)
        }

        this.isScanning = true;
        let attemptNo = 0
        const isTcpip = this.getName()==='tcpip'
        do {

            if (attemptNo===0)
                this.logEvent({message:'checking for ports',interface:this.ifaceName, port, excludes:this.inUse})
            //else 
                //this.logEvent({message:'checking for ports retry',interface:this.ifaceName, retry: attemptNo})

            attemptNo++;
            try {
                if (isTcpip) {
                    const _binding = binding as typeof TCPBinding
                    paths = await _binding.list(port, this.inUse)|| []
                    
                }
                else {
                    paths = await binding.list() || []
                    
                }
    
            }
            catch(err) {
                this.logEvent({message:'error',fn:'scan#detect ports', error:err.message, interface:this.ifaceName, port, excludes:this.inUse})
            }
            paths = paths.filter( p => !this.inUse.includes(p.path))


            


            if ( (!paths || paths.length===0) && attemptNo===1 ) {
                this.logEvent({message:'scanning: no ports detected',interface:this.ifaceName, paths:paths.map(p=>p.path),timeout})
                await sleep(1000)
            }
            if (Date.now()>toExpiresAt)
                timeOutExpired = true;
            

        }
        while (this.isScanning && !timeOutExpired && paths.length===0)
        
        if (paths.length===0) {
            this.logEvent({message:'nothing to scan '})
            if (this.toScan) {
                clearTimeout(this.toScan)
                this.toScan = null;
            }
            return[]
        }
        
        this.logEvent({message:'scanning on ',interface:this.ifaceName, paths:paths.map(p=>p.path).join(','),timeout})

        let listReduced = false;
        if (paths.length>MAX_PARALLEL_SCANS) {
            paths = paths.filter ( (p,idx) => idx<MAX_PARALLEL_SCANS)
        }

        const scanners: SinglePathScanner[] = paths.map( p=> new SinglePathScanner(p.path, this,{...props,logger:this.logger}))


        try {
            await Promise.all( scanners.map( s =>  
                s.scan()
                    .then( async device=> { 
                        
                        if (device) {

                            const adapter = SerialAdapterFactory.getInstance().createInstance(device)
                            const path = adapter.getPort()

                            this.inUse.push(path)

                            await adapter.pause()

                            detected.push(device)
                            this.emit('device',device)              
                        }
                    })
                    .catch()
                ))    
        }
        catch (err) {
            this.logEvent({message:'error', fn:'scan()',error:err.message||err, stack:err.stack})
        }

        if (this.toScan) {
            clearTimeout(this.toScan)
            this.toScan = null;
        }
        if (listReduced) {
            paths.forEach( p => this.inUse.push(p.path))
        }
        
        this.isScanning = false



        this.logEvent({message:'scan finished on',interface:this.ifaceName,paths:paths.map(p=>p.path),devices:detected.map(d=> {            
            const res = Object.assign({},d)
            res.interface = this.ifaceName
            return res
        })})

        return detected;
    }

    async stopScan(): Promise<boolean> {
        if (!this.isScanning)
            return true;

        if (this.toScan) {
            clearTimeout(this.toScan)
            this.toScan = null;
        }

        this.isScanning = false

        this.scanEvents.emit('stop')
        return true;
    }

    addKnownDevice(_settings: DeviceSettings): void {
        // not supported
    }

}