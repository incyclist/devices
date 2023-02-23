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



    async onStopRequest(resolve):Promise<void> {
        this.logger.logEvent({message:'stopping scan',path:this.path})
        await this.serial.closePort(this.path)
        this.isScanning=false;
        resolve(this.result)
    }

    async scan  (): Promise<SerialDeviceSettings|undefined>  {
        
        if (this.isScanning)
            return;

        this.isScanning = true;
        return new Promise<SerialDeviceSettings|undefined> ( async (resolve,reject) => {
            this.logger.logEvent({message:'starting scan',path:this.path})

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

                        resolve( {...adapterSettings,name} )
                        await this.serial.closePort(this.path).catch()
                    }
    
                }
                catch(err) {
                    /* ignore*/
                    this.logger.logEvent({message:'error', fn:'scan()', error:err.message||err, stack:err.stack})
                }
    
            }
    
        })
        
    }


}
/*
export abstract class AbstractIncyclistInterface extends  {
    abstract getName():string;
    abstract setBinding(binding:any):void;
    abstract connect(): Promise<boolean>;
    abstract disconnect(): Promise<Boolean> 
    abstract scan(props:IncyclistScanProps):Promise<DeviceSettings[]> 
}
*/


export default class SerialInterface  extends EventEmitter implements IncyclistInterface { 

    ifaceName: string;
    binding: BindingInterface;
    ports: PortMapping[]
    isScanning: boolean;
    isStopScanRequested: boolean;
    scanEvents: EventEmitter;
    logger: EventLogger;
    toScan: NodeJS.Timeout;
    

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
        this.logger = props.logger || new EventLogger( `Serial:${ifaceName}`)
        
        this.logger.logEvent({message:'new serial interface', ifaceName})

        if (binding) {
            this.setBinding(binding)
        }
        SerialInterface._add(this)
    }

    setBinding(binding: BindingInterface):void {
        this.binding = binding;
        SerialPortProvider.getInstance().setBinding(this.ifaceName,binding)
    }

    getName():string {
        return this.ifaceName
    }


    // connect just verifies that the Binding is valid - no ports are yet opened
    async connect(): Promise<boolean> {

        const binding = SerialPortProvider.getInstance().getBinding(this.ifaceName)
        if (!binding || !this.binding)
            return false;

        try {
            const SerialPort = this.binding;
            await SerialPort.list()
            return true;
        }
        catch(err) {
            return false;
        }
    }

    async disconnect(): Promise<Boolean> {
        // TODO
        return true;
    }

    async openPort(path:string): Promise< SerialPortStream|null> {
        this.logger.logEvent({message:'opening port',path})
        
        const port = SerialPortProvider.getInstance().getSerialPort(this.ifaceName, {path});
        if (!port) {            
            return null;
        }
        
        const existing = this.ports.findIndex( p=> p.path===path)
        if (existing!==-1) {
            const port = this.ports[existing].port;
            if (port.isOpen)
                return port;
            else {
                this.ports.splice(existing,1)
            }
        }
            
        return new Promise( (resolve) => {
            port.on('error',(err)=>{ 
                this.logger.logEvent({message:'error', path, error:err||err.message})
                resolve(null); 
                port.removeAllListeners()
            })
            port.once('open',()=>{
                this.logger.logEvent({message:'port opened',path})
                resolve(port); 
                port.removeAllListeners()
                this.ports.push({path,port})
            })
            port.open()
    
        })
    }

    async closePort(path:string): Promise<Boolean> {
        const existing = this.ports.findIndex( p=> p.path===path)
        if (existing===-1)
            return true;

        
        const port = this.ports[existing].port;
        if (!port.isOpen)
            return true;
        
        port.on('error',()=>{})
        port.flush();
        await port.drain();

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
        do {
            if (this.getName()==='tcpip') {
                const _binding = binding as typeof TCPBinding
                paths = await _binding.list(port)|| []
                
            }
            else {
                paths = await binding.list() || []
            }
            if (paths.length===0) {
                this.logger.logEvent({message:'scanning: no ports detected',interface:this.ifaceName, paths:paths.map(p=>p.path),timeout})
                sleep(1000)
            }
            if (Date.now()>toExpiresAt)
                timeOutExpired = true;
        }
        while (this.isScanning && !timeOutExpired && paths.length===0)
        
        if (paths.length===0) {
            if (this.toScan) {
                clearTimeout(this.toScan)
                this.toScan = null;
            }
            return[]
        }
        
        this.logger.logEvent({message:'scanning on ',paths:paths.map(p=>p.path),timeout})


        const scanners: SinglePathScanner[] = paths.map( p=> new SinglePathScanner(p.path, this,{...props,logger:this.logger}))

        try {
            await Promise.all( scanners.map( s =>  
                s.scan()
                    .then( device=> { 
                    
                        detected.push(device)
                        this.emit('device',device)          
                    })
                    .catch()
                ))    
        }
        catch (err) {
            this.logger.logEvent({message:'error', fn:'scan()',error:err.message||err, stack:err.stack})
        }
        if (this.toScan) {
            clearTimeout(this.toScan)
            this.toScan = null;
        }
        this.isScanning = false



        this.logger.logEvent({message:'scan finished on',interface:this.ifaceName,paths:paths.map(p=>p.path),devices:detected.map(d=> {            
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

