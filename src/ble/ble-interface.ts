import { EventLogger } from 'gd-eventlog';
import { sleep } from '../utils';
import { BleInterfaceClass, ConnectProps, ScanProps, BleDeviceClass,BlePeripheral,BleState,BleBinding,uuid, BleCharacteristic, BleDeviceDescription} from './ble'

const CONNECT_TIMEOUT = 5000;
const DEFAULT_SCAN_TIMEOUT = 20000;
const BACKGROUND_SCAN_TIMEOUT = 30000;
const DEFAULT_SERVICES = ['1818','180d','1826']

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

export interface PeripheralState {
    isLoading: boolean;
    isConfigured: boolean
    isInterrupted: boolean;
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

export interface PeripheralCacheItem {
    address: string,
    ts: number, 
    peripheral: BlePeripheral,
    state?: PeripheralState,
    characteristics?: BleCharacteristic []
}


export default class BleInterface extends BleInterfaceClass {
    scanState: ScanState = { isScanning: false, isConnecting:false,  timeout: undefined, isBackgroundScan:false}
    connectState: ConnectState = { isConnecting: false, isConnected: false,isInitSuccess: false }
    
    devices: BleDeviceInfo[] = [];          // devices that have been registered or recognized during scan
    peripheralCache = [];                   // peripherals that were detected in current and previous scans

    logger: EventLogger
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
//        else if ( props.log) {
            this.logger = new EventLogger( 'BLE');
//        }
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
            this.scan({timeout:BACKGROUND_SCAN_TIMEOUT,isBackgroundScan:true})
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
        let services = [] as string[]
        try {
            if (!deviceTypes || !Array.isArray(deviceTypes) || deviceTypes.length === 0) {
                return []
            }
            
            deviceTypes.forEach( DeviceType => {
                if (DeviceType.services) {
                    const dtServices = DeviceType.services;
                    dtServices.forEach( s => {
                        if ( !services.find( s2 => s2 === s)) 
                            services.push(s)
                    })
                }
            })    
        }
        catch( err) {console.log(err)}
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

    addPeripheralToCache( peripheral, props={}) {        
        this.peripheralCache.push({address:peripheral.address, ts:Date.now(), peripheral,...props});
    }

    async getCharacteristics( peripheral) {
        let characteristics = undefined;
        let chachedPeripheralInfo = this.peripheralCache.find( i => i.address===peripheral.address)

        // was peripheral already detected in recent scan?
        if (chachedPeripheralInfo &&  Date.now()-chachedPeripheralInfo.ts>600000) {
            chachedPeripheralInfo.ts = Date.now()
        }                
        if (!chachedPeripheralInfo) {                    
            this.addPeripheralToCache(peripheral)
            chachedPeripheralInfo = this.peripheralCache.find( i => i.address===peripheral.address)                    
        }

        if ( !chachedPeripheralInfo.characteristics) {
            try {
                
                chachedPeripheralInfo.state = { isConfigured:false, isLoading:true, isInterrupted:false}
                
                if ( chachedPeripheralInfo.peripheral && chachedPeripheralInfo.peripheral.state!=='connected') {
                    await peripheral.connectAsync();                    
                    chachedPeripheralInfo.peripheral.state = peripheral.state;

                }
                else {
                    peripheral.state = chachedPeripheralInfo.peripheral.state;

                }

                const res = await peripheral.discoverSomeServicesAndCharacteristicsAsync([],[])
                if ( !chachedPeripheralInfo.state.isInterrupted ) {
                    this.logEvent( {message:'characteristic info (+):', info:res.characteristics.map(c=>`${peripheral.address} ${c.uuid} ${c.properties}`)})

                    // keep connection open
                    /*
                    if (peripheral.disconnect && typeof(peripheral.disconnect)==='function')
                        peripheral.disconnect( ()=>{})
                    */
                    chachedPeripheralInfo.characteristics = res.characteristics
                    chachedPeripheralInfo.state = { isConfigured:true, isLoading:false, isInterrupted:false}
                    characteristics = res.characteristics;    
                }
                else {
                    this.logEvent( {message:'characteristic info:', info:'interrupted'})
                    chachedPeripheralInfo.state = { isConfigured:false, isLoading:false, isInterrupted:false}
                    throw new Error('interrupted')
                }


            }
            catch(err) {
                console.log (err)
            }
        }
        else {
            characteristics = chachedPeripheralInfo.characteristics                        
            this.logEvent( {message:'characteristic info (*):', info:characteristics.map(c=>`${peripheral.address} ${c.uuid} ${c.properties}`)})

        }

        if (!characteristics)
            this.logEvent( {message:'characteristic info:', info:'none'})

        return characteristics;

    }


    getDeviceClasses (peripheral, props:{ deviceTypes?: (typeof BleDeviceClass)[], profile?: string } = {}): (typeof BleDeviceClass)[] {
        let DeviceClasses;
        const {deviceTypes,profile}  = props;
        if ((!deviceTypes ||deviceTypes.length===0)) {
            // find matching Classes in the set of all registered Device Classes
            const classes = BleInterface.deviceClasses.map( c => c.Class)
            DeviceClasses = this.getDevicesFromServices( classes, peripheral.advertisement.serviceUuids) 
        }
        else {                            
            // find matching Classes in the set of requested Device Classes
            DeviceClasses = this.getDevicesFromServices(deviceTypes, peripheral.advertisement.serviceUuids) 
        }

        if (profile && DeviceClasses && DeviceClasses.length>0) {
            DeviceClasses = DeviceClasses.filter( C => {
                
                const device = new C({peripheral});
                if (device.getProfile()!==profile) 
                    return false;
                return true;
            })
        }
        return DeviceClasses
    }

    createDevice( DeviceClass: (typeof BleDeviceClass), peripheral: BlePeripheral, characteristics?:BleCharacteristic[]) {
        const C = DeviceClass as any; // avoid error "Cannot crate instance of abstract class"
        const device = new C({peripheral});
        device.setInterface(this)                
        device.characteristics= characteristics
        return device;
    }


    async connectDevice(requested: BleDeviceClass | BleDeviceDescription, timeout=DEFAULT_SCAN_TIMEOUT+CONNECT_TIMEOUT): Promise<BleDeviceClass> {
        const {id,name,address} = requested
        const profile = requested instanceof  BleDeviceClass  ? 
            (requested.getProfile && typeof(requested.getProfile)==='function' ? requested.getProfile() : undefined) : 
            requested.profile;

        this.logEvent({message:'connectDevice',id,name,address,profile,isbusy:this.scanState.isConnecting});


        if (this.scanState.isConnecting) {
            await this.waitForConnectFinished(CONNECT_TIMEOUT)
        }
        this.scanState.isConnecting = true;

        // Device already registered? Then we only need to connect
        const existing = this.devices.find( i => (!profile|| i.device.getProfile()===profile) && (i.device.address === requested.address || i.device.id === requested.id || i.device.name === requested.name))
        if (existing) {
            const connected = await existing.device.connect();
            this.scanState.isConnecting = false;
            return existing.device;
        }

        // Peripheral already exists? Then we only need to get Characteristics and connect
        const peripheralInfo = this.peripheralCache.find( i => (i.address === requested.address || (i.periphal&& i.peripheral.id===requested.id)))
        if (peripheralInfo) {
            if (!peripheralInfo.characteristic) {
                await this.getCharacteristics(peripheralInfo.periphal)
                                
                const DeviceClasses = this.getDeviceClasses( peripheralInfo.peripheral, {profile})
                if (!DeviceClasses || DeviceClasses.length===0)
                    return;
                const devices = DeviceClasses.map( C=> this.createDevice(C,peripheralInfo.periphal,peripheralInfo.characteristics))                    
                if (devices && devices.length>0) {
                    for (let i=0; i<devices.length;i++) {                        
                        const idx = this.devices.push( {device:devices[i], isConnected:false})-1;
                        await devices[i].connect();
                        this.devices[idx].isConnected = true;
                    }                    
                }                                
            }
            
        }
        

        let devices = [];
        let retry = false;
        let retryCount = 0;

        do {
            if (retryCount > 0) {
                this.logEvent({message:'retry connect device',id,name,address,profile, retryCount})
            }
            try {
                devices = await this.scan ( {timeout:DEFAULT_SCAN_TIMEOUT, requested:requested})         
                
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


    async scan( props:ScanProps) : Promise<BleDeviceClass[]> {
        const {timeout=DEFAULT_SCAN_TIMEOUT, deviceTypes=[],requested } = props;
        let profile;
        if (requested)
            profile = requested instanceof  BleDeviceClass  ? 
            (requested.getProfile && typeof(requested.getProfile)==='function' ? requested.getProfile() : undefined) : 
            requested.profile;
        const {id,address,name} = requested || {};
        
        const scanForDevice = (requested!==null && requested!==undefined)
        const services =  (props.isBackgroundScan || !deviceTypes || deviceTypes.length===0) ? DEFAULT_SERVICES : this.getServicesFromDeviceTypes(deviceTypes)
        const bleBinding = this.getBinding()
        if ( !bleBinding) 
            return Promise.reject(new Error('no binding defined')) 

        if (!this.isConnected()) {
            await this.connect();
        }

        // keep track of periphals processed dusing this scan
        const peripheralsProcessed = []
        const devicesProcessed = []

        this.logEvent( {message:'scan()',props, scanState:this.scanState, 
                        peripheralCache:this.peripheralCache.map(i=> ({address:i.address, ts:i.ts, name:i.peripheral? i.peripheral.advertisement.localName : ''})),
                        deviceCache: this.devices.map( i=> ({ address:i.device.address, profile:i.device.getProfile(),isConnected:i.isConnected }))
                    })

        // scan is already ongoing: stop if it is a background scan
        if (!props.isBackgroundScan && this.scanState.isBackgroundScan) {
            await this.stopScan();
            this.scanState.isBackgroundScan = false;
        }

        
        let opStr;
        if ( scanForDevice)  {
            opStr = 'search device';
            this.logEvent({message:'search device request',device:{id,address,name}, deviceTypes});
        }
        else  {
            opStr = 'scan'
            this.logEvent({message:'scan start', services});
        }

        // if scan is already in progress, wait until previous scan is finished 
        if ( this.scanState.isScanning) {
            try {
                this.logEvent({message:`${opStr}: waiting for previous scan to finish`});
                await this.waitForScanFinished(timeout)
            }
            catch(err) {
                this.logEvent({message:`${opStr} result: already scanning`});
                return Promise.reject(err)
            }
        }

        return new Promise( (resolve, reject) => {

            this.scanState.isScanning = true;
            if (props.isBackgroundScan) this.scanState.isBackgroundScan = true;

            if (scanForDevice ) {

                if (this.devices && this.devices.length>0) {
                    const knownDevices = this.devices.map( i => ({ name:i.device.name, address:i.device.address, isConnected:i.isConnected, connectState:i.device.getConnectState() }))
                    
                    this.logEvent({message:`${opStr}: check if already registered`, device:{name, address}, knownDevices})
                    
                    // are there already existing devices ?!?
                    const existing = this.devices.find( i=> (i.device.address===address || i.device.name===name || i.device.id===id ) );

                    
                    /*
                    if (existing) {
                        this.logEvent({message:`${opStr}: device is already registered`, device:{name, address}, knownDevices})
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
                    */
    
                }

                
            }

            const onTimeout = ()=>{                               
                if (!this.scanState.isScanning || !this.scanState.timeout)
                    return;

                this.scanState.timeout = null;
                this.logEvent({message:`${opStr} result: devices found`, requested: scanForDevice ? {name, address,profile}: undefined, devices:this.devices.map(i=> i.device.name+(!i.device.name || i.device.name==='')?`addr=${i.device.address}`:'')});
                this.getBinding().removeAllListeners('discover');
                this.logEvent({message:`${opStr}: stop scanning`, requested: scanForDevice ? {name, address,profile}: undefined,})
                bleBinding.stopScanning ( ()=> {
                    this.scanState.isScanning = false;
                    if (scanForDevice) {
                        reject( new Error('device not found'))
                        return 
                    }
                    resolve(this.devices.map( i => i.device))
                })
            }


            const onPeripheralFound = async (peripheral:BlePeripheral, fromCache:boolean=false)  => {                
                if (fromCache)
                    this.logEvent({message:'adding from Cache', peripheral:peripheral.address})

                if ( !peripheral ||!peripheral.advertisement || !peripheral.advertisement.serviceUuids || peripheral.advertisement.serviceUuids.length===0) 
                    return

                // check if same device was already processed in current scan
                const isPeripheralProcessed = peripheralsProcessed.find( p => p===peripheral.address)!==undefined;
                if (isPeripheralProcessed)
                    return;

                peripheralsProcessed.push(peripheral.address)
                let chachedPeripheralInfo = this.peripheralCache.find( i => i.address===peripheral.address)
                const str = fromCache ? 'added' : 'detected';
              
                const characteristics = await this.getCharacteristics(peripheral)
                const DeviceClasses = this.getDeviceClasses(peripheral,{profile});
    
                let cntFound = 0;
                DeviceClasses.forEach( DeviceClass => {
                    if (!DeviceClass)
                        return;
                    
                    if (scanForDevice && cntFound>0)
                        return;

                    const d = this.createDevice(DeviceClass, peripheral, characteristics)

                    if (scanForDevice) { 
                        if( 
                            (id && id!=='' && d.id === id) || 
                            (address && address!=='' && d.address===address) || 
                            (name && name!=='' && d.name===name))
                            cntFound++;
                    }
                    else // normal scan, we deliver all matching devices
                        cntFound++;
                

                    const existing = devicesProcessed.find( device  => device.id === d.id && device.getProfile()===d.getProfile())
                     
                    if (!scanForDevice && cntFound>0 && !existing) {                            
                        this.logEvent({message:`${opStr}: device found`, device:d.name, address:d.address, services:d.services.join(',')});
                        this.devices.push( {device:d,isConnected:peripheral.state==='connected'} )
                        devicesProcessed.push(d)
                        this.emit('device', d)
                        return;
                    }

                    if (scanForDevice&& cntFound>0)  {
                        this.logEvent({message:`${opStr}: device found`, device:d.name, address:d.address, services:d.services.join(',')});
                        this.devices.push( {device:d,isConnected:peripheral.state==='connected'} )
                        devicesProcessed.push(d)
                        this.emit('device', d)

                        process.nextTick( ()=> {
                            if (this.scanState.timeout) {
                                clearTimeout(this.scanState.timeout)
                                this.scanState.timeout= null;
                            }
                            this.logEvent({message:`${opStr}: stop scanning`, requested: scanForDevice ? {name, address,profile}: undefined,})

                            bleBinding.stopScanning ( ()=> {
                                this.getBinding().removeAllListeners('discover');
                                this.scanState.isScanning = false;
                                resolve([d])
                            })                    

                        })
                        
                    }


                })
            }
                
            this.logEvent({message:`${opStr}: start scanning`, requested: scanForDevice ? {name, address,profile}: undefined,timeout})
            this.peripheralCache.forEach( i => {
                onPeripheralFound(i.peripheral, true)
            })


            bleBinding.startScanning([], true, (err) => {                
                if (err) {
                    this.logEvent({message:`${opStr} result: error`, requested: scanForDevice ? {name, address,profile}: undefined,  error:err.message});
                    this.scanState.isScanning = false;
                    return reject(err)
                }
                bleBinding.on('discover', (p )=> {
                    onPeripheralFound(p) 
                })

            })

            this.scanState.timeout = setTimeout( onTimeout, timeout)

        })            
    
    }
    
    stopScan() : Promise<boolean> {
        if ( !this.scanState.isScanning) {
            return Promise.resolve(true)
        }
        if ( !this.getBinding())
            return Promise.reject(new Error('no binding defined')) 

        this.getBinding().removeAllListeners('discover');

        const ongoing = this.peripheralCache.filter( i=> i.state.isLoading);
        if (ongoing)
            ongoing.forEach( i => {i.isInterrupted = true;})

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