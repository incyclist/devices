import EventEmitter from "events";
import { PortInfo, BindingInterface } from "@serialport/bindings-interface";
import { SerialPortStream } from '@serialport/stream'
import SerialPortProvider from "./serialport";
import {SerialDeviceSettings} from './adapter'
import { TCPBinding } from "./bindings/tcp";
import { EventLogger } from "gd-eventlog";
import { sleep } from "../utils/utils";
import {  IncyclistScanProps } from "../types/device";
import { IncyclistInterface,InterfaceProps } from "../types/interface";
import AdapterFactory from "../adapters";


const DEFAULT_SCAN_TIMEOUT = 10000;

export const SerialInterfaceType = {
    SERIAL: 'serial',
    TCPIP: 'tcpip'
}

export interface SerialInterfaceProps extends InterfaceProps {
    ifaceName: string
    binding?: BindingInterface;
}

export type PortMapping = {
    path: string;
    port: SerialPortStream
}

export interface SerialScannerProps extends  IncyclistScanProps{
    port?: string;
    protocol: string;
}



export class SinglePathScanner {
    path:string;
    serial:SerialInterface
    result: SerialDeviceSettings
    isScanning: boolean
    props:SerialScannerProps
    logger:EventLogger

    constructor (path:string, serial:SerialInterface, props:SerialScannerProps) {
        this.path = path
        this.serial = serial
        this.result = undefined;
        this.isScanning = false;
        this.props = props
        this.logger = props.logger || new EventLogger('SerialScanner')
    }

    logEvent(event) {
        if ( this.logger) {
            this.logger.logEvent(event)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
    
        if (w?.DEVICE_DEBUG||process.env.BLE_DEBUG) {
            console.log( '~~~ SerialScanner', event)
        }

    }


    async onStopRequest(resolve):Promise<void> {
        this.logEvent({message:'stopping scan',path:this.path})
        await this.serial.closePort(this.path)
        this.isScanning=false;
        resolve(this.result)
    }

    async scan  (): Promise<SerialDeviceSettings|undefined>  {
        if (this.isScanning)
            return;

        this.isScanning = true;
        return new Promise<SerialDeviceSettings|undefined> ( async (resolve,reject) => {
            this.logEvent({message:'starting scan',path:this.path})

            this.serial.scanEvents.on('timeout',()=> this.onStopRequest(resolve) )
            this.serial.scanEvents.on('stop',()=> this.onStopRequest(resolve))
    
            let found = false;
            while (!found && this.isScanning ) {
                try {

                    const  {protocol} = this.props;

                    let host, port;
                    if ( this.serial.getName()===SerialInterfaceType.TCPIP) {
                        [host,port] = this.path.split(':')
                    }
                    else {
                        port = this.path;
                    }

                    const adapterSettings = {interface:this.serial.getName(), host,port, protocol}
                    
                    const adapter = AdapterFactory.create(adapterSettings)

                    found = await adapter.check()
                    if (found) {
                        const name = adapter.getName();
                        await this.serial.closePort(this.path).catch()
                        resolve( {...adapterSettings,name} )
                        
                        
                    }
                    await sleep(100)
                }
                catch(err) {
                    /* ignore*/
                    this.logEvent({message:'error', fn:'scan()', error:err.message||err, stack:err.stack})
                    await sleep(100)
                }
    
            }
    
        })
        
    }


}

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
    
        if (w?.DEVICE_DEBUG||process.env.BLE_DEBUG) {
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


    // connect just verifies that the Binding is valid - no ports are yet opened
    async connect(): Promise<boolean> {
        const binding = SerialPortProvider.getInstance().getBinding(this.ifaceName)
        if (!binding || !this.binding) {
            this.connected = false;
            return false;
        }

        try {
            const SerialPort = this.binding;
            await SerialPort.list()
            this.connected = true;
            return true;
        }
        catch(err) {
            this.connected = false;
            return false;
        }
    }

    async disconnect(): Promise<boolean> {
        this.connected = false;
        return true;
    }

    async openPort(path:string): Promise< SerialPortStream|null> {
        this.logEvent({message:'opening port',path})              
        const existing = this.ports.findIndex( p=> p.path===path)
        if (existing!==-1) {
            const port = this.ports[existing].port;
            if (port.isOpen) {
                this.logEvent({message:'opening port - port already exists',path})
                return port;
            }
            else {
                this.ports.splice(existing,1)
            }
        }

        const port = SerialPortProvider.getInstance().getSerialPort(this.ifaceName, {path});
        if (!port) {            
            this.logEvent({message:'opening port - port does not exist',path})
            return null;
        }

        return new Promise( (resolve) => {
            port.once('error',(err)=>{ 
                this.logEvent({message:'error', path, error:err.message||err})
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
        this.logEvent( {message:'closing port'})
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

        this.logEvent({message:'checking for ports'})
        this.isScanning = true;
        do {
            try {
                if (this.getName()==='tcpip') {
                    const _binding = binding as typeof TCPBinding
                    paths = await _binding.list(port)|| []
                    
                }
                else {
                    paths = await binding.list() || []
                }
    
            }
            catch(err) {
                console.log('~~~ERROR',err)
            }
            if (!paths || paths.length===0) {
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
        
        this.logEvent({message:'scanning on ',paths:paths.map(p=>p.path),timeout})


        const scanners: SinglePathScanner[] = paths.map( p=> new SinglePathScanner(p.path, this,{...props,logger:this.logger}))

        try {
            await Promise.all( scanners.map( s =>  
                s.scan()
                    .then( device=> { 

                        
                        if (device) {
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

        this.scanEvents.emit('stop')
        return true;
    }



}

