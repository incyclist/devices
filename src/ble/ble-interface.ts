import { EventLogger } from 'gd-eventlog';
import { sleep } from '../utils';
import { BleInterfaceClass, ConnectProps, ScanProps, BleDeviceClass,BlePeripheral,BleState,BleBinding,uuid} from './ble'

const CONNECT_TIMEOUT = 5000;

export interface ScanState {
    isScanning: boolean;
    isConnecting: boolean;
    isBackgroundScan: boolean;
    timeout?: NodeJS.Timeout;
}

export interface ConnectState {
    isConnecting: boolean;
    isConnected: boolean;
    timeout?: NodeJS.Timeout;
    isInitSuccess: boolean;
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
    scanState: ScanState = { isScanning: false, isConnecting:false,  timeout: undefined, isBackgroundScan:false}
    connectState: ConnectState = { isConnecting: false, isConnected: false,isInitSuccess: false }
    devices: BleDeviceInfo[] = []
    logger: EventLogger
    deviceCache = [];
    static deviceClasses: BleDeviceClassInfo[] = []
    static _instance: BleInterface;

    static getInstance(props: {binding?: BleBinding, log?:boolean, logger?:EventLogger}={}): BleInterface { 
        if ( !BleInterface._instance) {
            BleInterface._instance = new BleInterface(props);
        }
        else {  
            if ( props.binding) {
                BleInterface._instance.setBinding(props.binding)
            }
            if ( props.logger) {
                BleInterface._instance.logger = props.logger
            }
            if ( props.log && !BleInterface._instance.logger) { 
                BleInterface._instance.logger = new EventLogger( 'BLE');
            }
        }
        return BleInterface._instance;
    }

    constructor(props: {binding?: BleBinding, log?:boolean, logger?:EventLogger}={}) { 
        super(props)

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
        if (process.env.BLE_DEBUG) {
            console.log( '~~BLE:', event)
        }
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

        const runBackgroundScan = ()=> {
            // trigger background scan
            this.scanState.isBackgroundScan = true;
            this.scan({timeout:5000,isBackgroundScan:true})
            .then(  ()=> {
                this.scanState.isBackgroundScan = false;                        
            })
            .catch( ()=> {
                this.scanState.isBackgroundScan = false;                        
            })
        }

        return new Promise((resolve, reject) => {
            if ( this.connectState.isConnected) {
                return resolve(true);
            }
            this.logEvent({message:'connect request',});
            
            if ( !this.getBinding()) 
                return Promise.reject(new Error('no binding defined')) 

                
            this.connectState.timeout = setTimeout( ()=>{
                this.connectState.isConnected= false;
                this.connectState.isConnecting=false;
                this.connectState.timeout= null;                    
                this.logEvent( {message:'connect result: timeout'});
                reject( new Error('timeout'))
            }, timeout)

            try {

                if (!this.connectState.isInitSuccess) {
                    const binding = this.getBinding()._bindings
                    if (binding) {
                        const binding_init_original = binding.init.bind(binding);
                        const self = this;
    
                        binding.on('error', (err) => { this.getBinding().emit('error',err)})
    
                        binding.init = function() { 
                            try {
                                binding_init_original()
                                self.connectState.isInitSuccess = true;
                            }
                            catch (err) {
                                self.connectState.isInitSuccess = false;
                                self.connectState.isConnected = false;
                                self.connectState.isConnecting = false;
                                self.logEvent({message:'connect result: error', error:err.message});
                                return reject( new Error(err.message)   )
                            }
                        }    
                    }
                    else {
                        
                    }

                }

                const state = this.getBinding().state
                if(state === BleState.POWERED_ON ){
                    clearTimeout(this.connectState.timeout)
                    this.connectState.timeout= null;       

                    this.getBinding().removeAllListeners('stateChange')
                    this.getBinding().on('stateChange', this.onStateChange.bind(this))

                    this.connectState.isConnected = true;
                    this.connectState.isConnecting = false;
                    this.logEvent({message:'connect result: success'});
                    resolve(true);
                    runBackgroundScan()
                    return;
                    

                }
                else {
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
                            runBackgroundScan()

                            return resolve(true);
                        }  
                        else {
                            this.logEvent({message:'BLE state change', state});
                        }
    
                    })
    
                }
                
                
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
            return get(deviceTypes, (s)=> s === uuid(services))
        }
        if ( Array.isArray(services)) {
            return get(deviceTypes, s => services.map(uuid).includes(s))
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

    waitForConnectFinished( timeout) {
        const waitStart = Date.now();
        const waitTimeout = waitStart + timeout;

        return new Promise( (resolve, reject) => {
            const waitIv = setInterval( ()=>{
                    
                if (this.scanState.isConnecting && Date.now()>waitTimeout)  {
                    clearInterval(waitIv)
                    return reject(new Error('Connecting already in progress'))
                }
                if (!this.scanState.isConnecting) {
                    clearInterval(waitIv)
                    return resolve(true)
                }
    
            }, 100)
    
        })

    }


    async connectDevice(requested: BleDeviceClass, timeout=CONNECT_TIMEOUT): Promise<BleDeviceClass> {
        const {id,name,address,getProfile} = requested;
        const profile = getProfile && typeof(getProfile)==='function' ? getProfile() : undefined
        this.logEvent({message:'connectDevice',id,name,address,profile,isbusy:this.scanState.isConnecting});

        if (this.scanState.isConnecting) {
            await this.waitForConnectFinished(10000)
        }
        this.scanState.isConnecting = true;

        let devices = [];
        let retry = false;
        let retryCount = 0;

        do {
            if (retryCount > 0) {
                this.logEvent({message:'retry connect device',id,name,address,profile, retryCount})
            }
            try {
                devices = await this.scan ( {timeout, device:requested})         
                
                if (devices.length===0) {
                    retryCount++;
                    retry = retryCount<5;
                }
            }
            catch(err) {
                if (err.message==='scanning already in progress') {                              
                    await sleep(1000)
                    retryCount++;
                    retry = retryCount<5;
                    continue;
                }
                this.scanState.isConnecting = false;
                throw err;
            }
        }
        while (devices.length===0 && retry)

        if (devices.length === 0)  {
            this.logEvent({message:'connectDevice failure',id,name,address,profile, error:'device not found'});
            this.scanState.isConnecting = false;
            throw new Error('device not found');
        }

        if (devices[0]) {
            this.logEvent({message:'connectDevice connecting',id,name,address,profile});
            const connected =  await devices[0].connect()
            this.scanState.isConnecting = false;
            if (connected) {
                this.logEvent({message:'connectDevice success',id,name,address,profile});
                return devices[0];
            }
            else {
                this.logEvent({message:'connectDevice failure',id,name,address,profile});
                throw new Error('connect failed')
            }
        }
        
    }

    waitForScanFinished( timeout) {
        const waitStart = Date.now();
        const waitTimeout = waitStart + timeout;

        return new Promise( (resolve, reject) => {
            const waitIv = setInterval( ()=>{
                    
                if (this.scanState.isScanning && Date.now()>waitTimeout)  {
                    clearInterval(waitIv)
                    return reject(new Error('scanning already in progress'))
                }
                if (!this.scanState.isScanning) {
                    clearInterval(waitIv)
                    return resolve(true)
                }
    
            }, 100)
    
        })

    }

    addPeripheralToCache(peripheral:BlePeripheral):void {

        try {
            this.logEvent({message:'adding device to cache', device: { address:peripheral.address, name:peripheral.advertisement ? peripheral.advertisement.localName : '' }})

            const existing = this.deviceCache.find( p => p.address === peripheral.address)
            if (!existing)
                this.deviceCache.push(peripheral);
            else {
                if (peripheral.advertisement && peripheral.advertisement.localName!=='' && existing.advertisement && existing.advertisement.localName==='')
                    existing.advertisement.localName = peripheral.advertisement.localName;
            }
    
        }
        catch(err) {
            console.log('~~~ error', err)
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

        this.logEvent( {message:'scan()',props, scanState:this.scanState, cache:this.deviceCache.map(p=> ({name:p.advertisement? p.advertisement.localName:'', address:p.address}))})

        if (!props.isBackgroundScan && this.scanState.isBackgroundScan) {
            await this.stopScan();
            this.scanState.isBackgroundScan = false;
        }

        const detectedPeripherals: Record<string,BlePeripheral> = {}
        let opStr;
        if ( scanForDevice)  {
            opStr = 'search device';
            const {id,address,name} = device;
            this.logEvent({message:'search device request',device:{id,address,name}, deviceTypes});
        }
        else  {
            opStr = 'scan'
            this.logEvent({message:'scan start', services});
        }
        // if scan is already in progress, wait until previous scan is finished 
        if ( this.scanState.isScanning) {
            try {
                await this.waitForScanFinished(timeout)
            }
            catch(err) {
                this.logEvent({message:`${opStr} result: already scanning`});
                return Promise.reject(err)
            }
        }

        return new Promise( (resolve, reject) => {

            this.scanState.isScanning = true;

            if (scanForDevice && device instanceof BleDeviceClass ) {

                if (this.devices && this.devices.length>0) {
                    const connectedDevices = this.devices.map( i => ({ name:i.device.name, address:i.device.address, isConnected:i.isConnected, connectState:i.device.getConnectState() }))
                    const {name, address} = device
                    this.logEvent({message:`${opStr}: check if already registered`, device:{name, address}, connectedDevices})
                    const existing = this.devices.find( i=> (i.device.address===device.address || i.device.name===device.name) );
    
                    if (existing) {
                        const d = device as any;
                        const linkedDevice = existing.device
                        d.peripheral = existing.device.peripheral;
                        if (d.setInterface && typeof (d.setInterface)==='function')                    
                            d.setInterface(this);
                        
                        setTimeout( ()=>{
                            let connectState = linkedDevice.getConnectState();
                            this.logEvent({message:`${opStr}: device already registered`, device:device.name, address:device.address,connectState });         
                            
                            if (connectState.isConnecting) {
                                const waitStart = Date.now();
                                const waitTimeout = waitStart + timeout;

                                const waitIv = setInterval( ()=>{
                                    try {
    
                                        connectState = linkedDevice.getConnectState();
                                        //console.log( '~~~',Date.now()-waitStart, connectState)
                                        if (connectState.isConnecting && Date.now()>waitTimeout)  {
                                            clearInterval(waitIv)
                                            this.scanState.isScanning = false;
                                            return resolve([])
                                        }
                                        if (!connectState.isConnecting) {
                                            clearInterval(waitIv)
                                            this.scanState.isScanning = false;
                                            return resolve([device])
                                        }
                        
                                    }
                                    catch( err) { console.log('~~~ error',err)}
                        
                                }, 100)
                                
    
                            }
                            else if (connectState.isConnected ) {
                                this.scanState.isScanning = false;
                                resolve([device])
                            }
                            else {
                                this.scanState.isScanning = false;
                                resolve([])
                            }
    
                        }, 100)
                        
                    }
    
                }

                
            }

            const onPeripheralFound = (peripheral:BlePeripheral, fromCache:boolean=false)  => {
                //if (!this.peripherals[peripheral.id]) 
                if (fromCache)
                    this.logEvent({message:'adding from Cache', peripheral:peripheral.address})

                if ( !peripheral ||!peripheral.advertisement) 
                    return



                if (!detectedPeripherals[peripheral.id]) {
                    if (  process.env.BLE_DEBUG)
                        console.log('discovered' ,peripheral)
                    detectedPeripherals[peripheral.id] = peripheral;

                    this.addPeripheralToCache(peripheral)                  

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

                    DeviceClasses.forEach( DeviceClass => {
                        let cntFound = 0;
                        if (!DeviceClass)
                            return;
                        if (scanForDevice && cntFound>0)
                            return;

                        const C = DeviceClass as any
                        const d = new C({peripheral});
                        if (device && device.getProfile && device.getProfile()!==d.getProfile()) 
                        return;

                        d.setInterface(this)

                        if (scanForDevice) { 
                            if( 
                                (device.id && device.id!=='' && d.id === device.id) || 
                                (device.address && device.address!=='' && d.address===device.address) || 
                                (device.name && device.name!=='' && d.name===device.name))
                                
                                
                                cntFound++;
                        }
                        else 
                            cntFound++;

                        const existing = this.devices.find( i  => i.device.id === d.id && i.device.getProfile()===d.getProfile())
                        /*
                        console.log('~~~found', d.name, existing,cntFound, scanForDevice, device,
                            (device.id && device.id!=='' && d.id === device.id)  ,
                            (device.address && device.address!=='' && d.address===device.address),
                            (device.name && device.name!=='' && d.name===device.name)
                        )
                        */
                        if (!scanForDevice && cntFound>0 && !existing) {                            
                            this.logEvent({message:`${opStr}: device found`, device:d.name, address:d.address, services:d.services.join(',')});
                            this.devices.push( {device:d,isConnected:false} )
                            this.emit('device', d)
                        }

                        if (scanForDevice&& cntFound>0)  {
                            if (fromCache) {
                                resolve([d])
                                return;
                            }

                            if (this.scanState.timeout) {
                                clearTimeout(this.scanState.timeout)
                                this.scanState.timeout= null;
                                this.logEvent({message:`${opStr}: stop scanning`, requested: scanForDevice ? {name:device.name, address:device.address}: undefined,})

                                bleBinding.stopScanning ( ()=> {
                                    this.getBinding().removeAllListeners('discover');
                                    this.scanState.isScanning = false;
                                    resolve([d])
                                })                    
                            }
                            else {
                                resolve([d])
                            }
                            
                        }

                    })

                    

                }
                else {
                    // peripheral is already detected in this scan
                    
                }
            }
                
            this.logEvent({message:`${opStr}: start scanning`, requested: scanForDevice ? {name:device.name, address:device.address}: undefined,timeout})
            this.deviceCache.forEach( peripheral => {
                onPeripheralFound(peripheral, true)
            })
            bleBinding.startScanning([], true, (err) => {
                
                if (err) {
                    this.logEvent({message:`${opStr} result: error`, requested: scanForDevice ? {name:device.name, address:device.address}: undefined,  error:err.message});
                    this.scanState.isScanning = false;
                    return reject(err)
                }
                bleBinding.on('discover', (p )=> {
                    console.log('~~~ discovered:',p.address, p.advertisement? p.advertisement.localName :'')
                    onPeripheralFound(p) 
                })

            })

            this.scanState.timeout = setTimeout( ()=>{               
                this.scanState.timeout = null;
                this.logEvent({message:`${opStr} result: devices found`, requested: scanForDevice ? {name:device.name, address:device.address}: undefined, devices:this.devices.map(i=> i.device.name+(!i.device.name || i.device.name==='')?`addr=${i.device.address}`:'')});
                this.getBinding().removeAllListeners('discover');
                this.logEvent({message:`${opStr}: stop scanning`, requested: scanForDevice ? {name:device.name, address:device.address}: undefined,})
                bleBinding.stopScanning ( ()=> {
                    this.scanState.isScanning = false;
                    if (scanForDevice) {
                        reject( new Error('device not found'))
                        return 
                    }
                    resolve(this.devices.map( i => i.device))
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

        this.getBinding().removeAllListeners('discover');

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

    findConnected(device: BleDeviceClass|BlePeripheral): BleDeviceClass {
        const connected =  this.devices.find( i => i.device.id===device.id && i.isConnected)
        if (connected)
            return connected.device
        return undefined;
    }


    removeConnectedDevice(device: BleDeviceClass):void { 
        const existigDevice = this.devices.find( i => i.device.id === device.id)

        if (existigDevice) {
            existigDevice.isConnected = false;
            return
        }
        
    }

}