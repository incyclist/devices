import { EventLogger } from 'gd-eventlog';
import { BleInterfaceClass, ConnectProps, ScanProps, BleDeviceClass,BlePeripheral,BleState,BleBinding} from './ble'

export interface ScanState {
    isScanning: boolean;
    timeout?: NodeJS.Timeout;
}

export interface ConnectState {
    isConnecting: boolean;
    isConnected: boolean;
    timeout?: NodeJS.Timeout;
    isOpened: boolean;
}

export interface BleDeviceInfo { 
    device: BleDeviceClass;
    isConnected: boolean;
}

export interface BleDeviceClassInfo { 
    Class: typeof BleDeviceClass,
    type: string
    services: string[];
    id: string;
}

export default class BleInterface extends BleInterfaceClass {
    scanState: ScanState = { isScanning: false, timeout: undefined}
    connectState: ConnectState = { isConnecting: false, isConnected: false,isOpened: false }
    devices: BleDeviceInfo[] = []
    logger: EventLogger
    static deviceClasses: BleDeviceClassInfo[] = []

    constructor(props: {binding?: BleBinding, log?:boolean, logger?:EventLogger}={}) { 
        super(props)

        console.log('BleInterface constructor', props)
        if ( props.logger ) 
            this.logger = props.logger
        else if ( props.log) {
            this.logger = new EventLogger( 'BLE');
        }
    }

    static register(id:string, type:string, Class: typeof BleDeviceClass, services: string[]) { 
        if (this.deviceClasses.find( i => i.id === id)) 
            return;
        this.deviceClasses.push({id,type, Class, services})
    }


    logEvent(event) {
        if ( this.logger) {
            this.logger.logEvent(event)
        }
        //if (process.env.BLE_DEBUG) {
            console.log( event)
        //}
    }


    onStateChange(state) {        
        if(state !== BleState.POWERED_ON){       
            this.connectState.isConnected = false;
        } else {
            this.connectState.isConnected = true;
        }         
    }
    onError(err) {
        this.logEvent({message:'error', error:err.message, stack:err.stack});
    }

    connect(props: ConnectProps={}): Promise<boolean> {
        const timeout = props.timeout || 2000;


        return new Promise((resolve, reject) => {
            if ( this.connectState.isConnected) {
                return resolve(true);
            }
            this.logEvent({message:'connect request'});
            
            if ( !this.getBinding()) 
                return Promise.reject(new Error('no binding defined')) 

            if (!this.connectState.isOpened) {
                
                this.connectState.timeout = setTimeout( ()=>{
                    this.connectState.isConnected= false;
                    this.connectState.isConnecting=false;
                    this.connectState.timeout= null;                    
                    this.logEvent( {message:'connect result: timeout'});
                    reject( new Error('timeout'))
                }, timeout)
    
                try {

                    const binding = this.getBinding()._bindings
                    const binding_init_original = binding.init.bind(binding);
                    const self = this;

                    binding.init = function() { 
                        try {
                            binding_init_original()
                            self.connectState.isOpened = true;
                        }
                        catch (err) {
                            self.connectState.isOpened = false;
                            self.connectState.isConnected = false;
                            self.connectState.isConnecting = false;
                            this.logEvent({message:'connect result: error', error:err.message});
                            return reject( new Error(err.message)   )
                        }
                    }
                    
                    this.getBinding().once('error', (err) => {                        
                        this.connectState.isConnected = true;
                        this.connectState.isConnecting = false;
                        this.logEvent({message:'connect result: error', error:err.message});

                        this.getBinding().on('error', this.onError.bind(this))

                        return reject(err)
                    })
    
                    this.getBinding().on('stateChange', (state) => {
                        if(state === BleState.POWERED_ON){
                            clearTimeout(this.connectState.timeout)
                            this.connectState.timeout= null;       

                            this.getBinding().removeAllListeners('stateChange')
                            this.getBinding().on('stateChange', this.onStateChange.bind(this))

                            this.connectState.isConnected = true;
                            this.connectState.isConnecting = false;
                            this.logEvent({message:'connect result: success'});
                            return resolve(true);
                        }  

                    })
                    
                }
                catch (err) {
                    this.connectState.isConnected= false;
                    this.connectState.isConnecting=false;
                    if ( this.connectState.timeout)
                        clearTimeout(this.connectState.timeout)
                    this.connectState.timeout= null;                    
                    this.logEvent({message:'connect result: error', error:err.message});
                    return reject(new Error('bluetooth unavailable, cause: ' + err.message))
                }
            }

            


        })            
    }

    async disconnect(): Promise<boolean> {
        if ( !this.connectState.isConnected) {
            return Promise.resolve(true)
        }
        if ( !this.getBinding())
            return Promise.reject(new Error('no binding defined')) 

        this.logEvent({message:'disconnect request'});

        if ( this.scanState.isScanning) {
            await this.stopScan();
        }

        const connectedDevices = this.devices.filter( d => d.isConnected);
        for (let i=0; i<connectedDevices.length; i++) { 
            const d = connectedDevices[i];
            const device = d.device as  BleDeviceClass;
            await device.disconnect();            
        }

        this.connectState.isConnected = false;
        this.connectState.isConnecting = false;
        if ( this.connectState.timeout) {
            clearTimeout(this.connectState.timeout)
            this.connectState.timeout= null;
        }
        this.logEvent({message:'disconnect result: success'});
        return true;
    }

    isConnected(): boolean { 
        return this.connectState.isConnected;
    }

    getDevicesFromServices(deviceTypes : (typeof BleDeviceClass)[],services :string | string[]) : (typeof BleDeviceClass)[] {
        if (!deviceTypes || !Array.isArray(deviceTypes) || deviceTypes.length === 0) {
            return []
        }

        const get = (deviceTypes: (typeof BleDeviceClass)[], fnCompare: (s:string)=>boolean ) => {
            return deviceTypes.filter( DeviceType  => { 
                const C = DeviceType as any
                if (!C.services)
                    return false
                return C.services.find( (s:string) => fnCompare(s) )
            })    
        }

        if ( typeof services === 'string') { 
            return get(deviceTypes, (s)=> s === services)
        }
        if ( Array.isArray(services)) {
            return get(deviceTypes, s => services.includes(s))
        }
        return []   
    }

    getServicesFromDeviceTypes(deviceTypes:(typeof BleDeviceClass)[]): string[] {
        if (!deviceTypes || !Array.isArray(deviceTypes) || deviceTypes.length === 0) {
            return []
        }
        const services = [] as string[]
        deviceTypes.forEach( DeviceType => {
            if (DeviceType.services) {
                const dtServices = DeviceType.services;
                dtServices.forEach( s => {
                    if ( !services.find( s2 => s2 === s)) 
                        services.push(s)
                })
            }
        })
        return services;
    }

    getServicesFromDevice(device: BleDeviceClass): string[] {
        if (!device ) 
            return []
        const services = [] as string[]
        const dServices = device.getServiceUUids();
        dServices.forEach( s => {
            if ( !services.find( s2 => s2 === s)) 
                services.push(s)
        })

        return services;             
    }

    async connectDevice(requested: BleDeviceClass, timeout=2000): Promise<BleDeviceClass> {
        const devices = await this.scan ( {timeout, device:requested})

        const {id,address,name} = requested;

        if (devices.length === 0) 
            throw new Error('device not found');


        if (devices[0]) {
            const connected =  await devices[0].connect()
            if (connected) {
                return devices[0];
            }
            else {
                throw new Error('connect failed')
            }
        }
        
    }

    async scan( props:ScanProps) : Promise<BleDeviceClass[]> {
        const {timeout=5000, deviceTypes=[],device } = props;
        const scanForDevice = (device!==null && device!==undefined)
        const services =  this.getServicesFromDeviceTypes(deviceTypes)
        const bleBinding = this.getBinding()
        if ( !bleBinding) 
            return Promise.reject(new Error('no binding defined')) 

        if (!this.isConnected()) {
            await this.connect();
        }

        const detectedPeripherals: Record<string,BlePeripheral> = {}
        if ( scanForDevice) 
            this.logEvent({message:'search device request',device, deviceTypes});
        else 
            this.logEvent({message:'scan start', services});

        return new Promise((resolve, reject) => {
            if ( this.scanState.isScanning) {
                this.logEvent({message:'scan result: already scanning'});
                return reject(new Error('scanning already in progress'))
            }
            this.scanState.isScanning = true;

            
            bleBinding.startScanning(services, true, (err) => {
                
                if (err) {
                    this.logEvent({message:'scan result: error', error:err.message});
                    this.scanState.isScanning = false;
                    return reject(err)
                }
                
                bleBinding.on('discover', (peripheral) => {
                    
                    //if (!this.peripherals[peripheral.id]) 
                    if ( !peripheral ||!peripheral.advertisement) 
                        return

                    if (!detectedPeripherals[peripheral.id]) {
                        detectedPeripherals[peripheral.id] = peripheral;
                        let DeviceClasses;
                        if (scanForDevice && (!deviceTypes ||deviceTypes.length===0)) {
                            // find matching Classes in the set of all registered Device Classes
                            const classes = BleInterface.deviceClasses.map( c => c.Class)
                            DeviceClasses = this.getDevicesFromServices( classes, peripheral.advertisement.serviceUuids) 
                        }
                        else {                            
                            // find matching Classes in the set of requested Device Classes
                            DeviceClasses = this.getDevicesFromServices(deviceTypes, peripheral.advertisement.serviceUuids) 
                        }
                        
                        let cntFound = 0;
                        DeviceClasses.forEach( DeviceClass => {
                            if (!DeviceClass)
                                return;
                            if (scanForDevice && cntFound>0)
                                return;

                            const C = DeviceClass as any
                            const d = new C({peripheral});
                            d.setInterface(this)
                            if (scanForDevice) { 
                                if( (device.id && d.id === device.id) || (device.address && d.address===device.address) || (device.name&&d.name===device.name)) 
                                    cntFound++;
                            }
                            else 
                                cntFound++;

                            if (cntFound>0) {
                                this.logEvent({message:'scan: device found', device:d.name, services:d.services.join(',')});
                                this.devices.push( {device:d,isConnected:false} )
                                this.emit('device', d)
                            }


                            if (scanForDevice&& cntFound>0)  {
                                if (this.scanState.timeout) {
                                    clearTimeout(this.scanState.timeout)
                                    this.scanState.timeout= null;
                                    bleBinding.stopScanning ( ()=> {
                                        this.scanState.isScanning = false;
                                    })                    
                                }
                                resolve([d])
                            }
    
                        })

                        

                    }
                    
                })
            })

            this.scanState.timeout = setTimeout( ()=>{               
                this.scanState.timeout = null;
                this.logEvent({message:'scan result: devices found', devices:this.devices.map(i=> i.device.name)});
                resolve(this.devices.map( i => i.device))
                bleBinding.stopScanning ( ()=> {
                    this.scanState.isScanning = false;
                })
            }, timeout)

        })            
    
    }
    
    stopScan() : Promise<boolean> {
        if ( !this.scanState.isScanning) {
            return Promise.resolve(true)
        }
        if ( !this.getBinding())
            return Promise.reject(new Error('no binding defined')) 

        this.logEvent({message:'scan stop request'});
        return new Promise ( resolve=> {
            this.getBinding().stopScanning( ()=> {
                this.scanState.isScanning = false;
                this.logEvent({message:'scan stop result: success'});
                resolve(true)
            })
        })
    }


    isScanning(): boolean {
        return this.scanState.isScanning
    }

    addConnectedDevice(device: BleDeviceClass):void { 
        const existigDevice = this.devices.find( i => i.device.id === device.id)

        if (existigDevice) {
            existigDevice.isConnected = true;
            return
        }
        this.devices.push( {device,isConnected:true})            
    }

    removeConnectedDevice(device: BleDeviceClass):void { 
        const existigDevice = this.devices.find( i => i.device.id === device.id)

        if (existigDevice) {
            existigDevice.isConnected = false;
            return
        }
        
    }

}