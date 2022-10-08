import { EventLogger } from 'gd-eventlog';
import { sleep } from '../utils';
import { BleInterfaceClass, ConnectProps, ScanProps, BleDeviceClass,BlePeripheral,BleState,BleBinding,uuid, BleCharacteristic, BleDeviceDescription} from './ble'
import { BleDevice } from './ble-device';
import {matches} from './ble'
import BlePeripheralConnector from './ble-peripheral';

const CONNECT_TIMEOUT = 5000;
const DEFAULT_SCAN_TIMEOUT = 20000;

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
//        if (process.env.BLE_DEBUG) {
            console.log( '~~BLE:', event)
//        }
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
            const types =  deviceTypes.filter( DeviceType  => { 
                const C = DeviceType as any

                let found = false;
                if (C.services)
                    found = C.services.find( (s:string) => fnCompare(s) )

                return found;
            })    
            return types;

        }
        if ( typeof services === 'string') { 
            return get(deviceTypes, (s)=> matches(s,services) )
        }
        if ( Array.isArray(services)) {
            const sids = services.map(uuid);
            return get(deviceTypes, s => { 
                const res = sids.find( (service)=> matches(s,service)) 
                return res!==undefined;
            })
        }
        return []   
    }

    getAllSupportedServices() {
        const supported = BleInterface.deviceClasses;
        const res = [];

        if (supported && supported.length>0) {
            supported.forEach( dc => {
                if (dc && dc.services) {
                    dc.services.forEach( s => {
                        if ( !res.includes(s))
                            res.push(s)
                    })
                }

            })
        }

        return res;
        
    }

    getAllSupportedDeviceTypes() {
        const supported = BleInterface.deviceClasses;
        return supported.map( dc => dc.Class)
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
        const info = this.peripheralCache.find( i => i.address===peripheral.address)
        const connector = info && info.connector ? info.connector : new BlePeripheralConnector(this,peripheral)
        this.peripheralCache.push({address:peripheral.address, ts:Date.now(), peripheral,connector, ...props});
    }

    onDisconnect(peripheral):void {
        const idx = this.peripheralCache.findIndex( i => i.address===peripheral.address)
        if (idx!==-1)
            this.peripheralCache.splice(idx,1);
    }

    getConnector( peripheral:BlePeripheral) {
        const info = this.peripheralCache.find( i => i.address===peripheral.address)

        if (!info) {
            const connector =  new BlePeripheralConnector(this,peripheral)
            this.peripheralCache.push({address:peripheral.address, ts:Date.now(), peripheral,connector});
            return connector;
        }
        return info.connector;            
    }

    findPeripheral(peripheral:BlePeripheral | { id?:string, address?:string, name?:string}):BlePeripheral {
        const info = this.peripheralCache.find( i => i.address===peripheral.address || peripheral.address===i.peripheral.address || peripheral.name===i.peripheral.name || peripheral.id===i.peripheral.id)
        return info ? info.peripheral : undefined;
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

        const connector = chachedPeripheralInfo.connector;

        if ( !chachedPeripheralInfo.characteristics) {
            try {
                
                chachedPeripheralInfo.state = { isConfigured:false, isLoading:true, isInterrupted:false}
                await connector.connect();
                peripheral.state = connector.getState();
                
                await connector.initialize();
                characteristics = connector.getCharachteristics();
                this.logEvent( {message:'characteristic info (+):', info:characteristics.map(c=>`${peripheral.address} ${c.uuid} ${c.properties}`)})

                chachedPeripheralInfo.characteristics = characteristics
                chachedPeripheralInfo.state = { isConfigured:true, isLoading:false, isInterrupted:false}

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


    getDeviceClasses (peripheral, props:{ deviceTypes?: (typeof BleDeviceClass)[], profile?: string, services?: string[] } = {}): (typeof BleDeviceClass)[] {
        let DeviceClasses;
        const {deviceTypes,profile,services=peripheral.advertisement.serviceUuids}  = props;


        if ((!deviceTypes ||deviceTypes.length===0)) {
            // find matching Classes in the set of all registered Device Classes
            const classes = BleInterface.deviceClasses.map( c => c.Class)

            DeviceClasses = this.getDevicesFromServices( classes, services) 
        }
        else {                            
            // find matching Classes in the set of requested Device Classes
            DeviceClasses = this.getDevicesFromServices(deviceTypes, services) 
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

        try {
            const C = DeviceClass as any; // avoid error "Cannot crate instance of abstract class"
            const device = new C({peripheral}) as BleDevice;
            const cids = characteristics ?  characteristics.map(c=> uuid(c.uuid) ) : [];
            
            this.logEvent({message:'trying to create device',peripheral: peripheral.address,characteristics:cids, profile:device.getProfile() })

            const existingDevice = this.devices.find( i => i.device.id === device.id && i.device.getProfile()===device.getProfile())
            if (existingDevice)
                return existingDevice.device;
            
            device.setInterface(this)     
            if ( characteristics && device.isMatching(cids)) {
                device.characteristics= characteristics;
                device.setCharacteristicUUIDs(characteristics.map(c => c.uuid));
    
                return device;    
            }
            else {
                this.logEvent({message:'failed to create device',peripheral: peripheral.address,profile:device.getProfile() })

            }
            
        }
        catch(err) {
            this.logEvent({message:'error',fn:'',error:err.message||err, stack:err.stack })

        }
        
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
            this.logEvent({message:'connect existing device'});
            await existing.device.connect();
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
                        if (!devices[i].isConnected())
                            await devices[i].connect();
                        this.devices[idx].isConnected = true;
                    }                    
                }                                
            }

            const connectedDevice = this.devices.find( d => d.isConnected)
            if (connectedDevice)
                return connectedDevice.device
                
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

    getBestDeviceMatch(DeviceClasses : (typeof BleDeviceClass)[]):typeof BleDeviceClass {
        const details = DeviceClasses.map( c=> ( {name:c.prototype.constructor.name, priority:(c as any).detectionPriority||0,class:c } ))
        details.sort( (a,b) => b.priority-a.priority)
        return details[0].class
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
        const services =  (!deviceTypes || deviceTypes.length===0) ? this.getAllSupportedServices() : this.getServicesFromDeviceTypes(deviceTypes)
        const bleBinding = this.getBinding()
        if ( !bleBinding) 
            return Promise.reject(new Error('no binding defined')) 

        if (!this.isConnected()) {
            await this.connect();
        }

        // keep track of periphals processed dusing this scan
        const peripheralsProcessed = []
        const devicesProcessed = []

        
        this.logEvent( {message:'scan()',props:{ timeout}, scanState:this.scanState, 
                        peripheralCache:this.peripheralCache.map(i=> ({address:i.address, ts:i.ts, name:i.peripheral? i.peripheral.advertisement.localName : ''})),
                        deviceCache: this.devices.map( i=> ({ address:i.device.address, profile:i.device.getProfile(),isConnected:i.isConnected }))
                    })
       
        let opStr;
        if ( scanForDevice)  {
            opStr = 'search device';
            this.logEvent({message:'search device request',services,device:{id,address,name}, deviceTypes});
        }
        else  {
            opStr = 'scan'
            const supported = BleInterface.deviceClasses.map(dc => ({id:dc.id, type:dc.type,services:dc.services }))
            this.logEvent({message:'scan start', services,supported});
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

            if (scanForDevice ) {

                if (this.devices && this.devices.length>0) {
                    const knownDevices = this.devices.map( i => ({ name:i.device.name, address:i.device.address, isConnected:i.isConnected, connectState:i.device.getConnectState() }))
                    
                    this.logEvent({message:`${opStr}: check if already registered`, device:{name, address}, knownDevices})
                    
                    // are there already existing devices ?!?
                    const existing = this.devices.find( i=> (i.device.address===address || i.device.name===name || i.device.id===id ) );
                    if (existing)
                        this.logEvent( {message: `${opStr}: device already registered`, device:{name, address}})                   
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
                if ( !peripheral ||!peripheral.advertisement || !peripheral.advertisement.localName  || !peripheral.advertisement.serviceUuids ) 
                    return
                
                if (fromCache) {
                    this.logEvent({message:'adding from Cache', peripheral:peripheral.address})
                }
                else {
                    const {id,name,address,advertisement={}} = peripheral;                    
                    
                    this.logEvent({message:'BLE scan: found device',peripheral:{id,name:advertisement.localName,address,services:advertisement.serviceUuids}})
                }



                // I found some scans (on Mac) where address was not set
                if (peripheral.address===undefined || peripheral.address==='')
                    peripheral.address = peripheral.id;

                // check if same device was already processed in current scan
                const isPeripheralProcessed = peripheralsProcessed.find( p => p===peripheral.address)!==undefined;
                if (isPeripheralProcessed)
                    return;

                peripheralsProcessed.push(peripheral.address)

                if (scanForDevice && requested.name && requested.name!==peripheral.advertisement.localName)
                    return;
              
                const connector = this.getConnector(peripheral);
                const characteristics = await this.getCharacteristics(peripheral)


                const connectedServices = connector.getServices();
                const services = connectedServices ? connectedServices.map(cs=>cs.uuid) : undefined;
                const connectedPeripheral = connector.getPeripheral();
                const {id,name,address,advertisement={}} = connectedPeripheral;  
                const DeviceClasses = this.getDeviceClasses(connectedPeripheral,{profile,services}) || [];
                
                this.logEvent({message:'BLE scan: device connected',peripheral:{id,name,address,services:advertisement.serviceUuids},services, classes:DeviceClasses.map(c=>c.prototype.constructor.name) })                
    
                let cntFound = 0;
                const DeviceClass = this.getBestDeviceMatch(DeviceClasses);
                
//                DeviceClasses.forEach( async DeviceClass => {
                    if (!DeviceClass)
                        return;
                    
                    if (scanForDevice && cntFound>0)
                        return;

                    const d = this.createDevice(DeviceClass, peripheral, characteristics) as BleDevice
                    if (!d) {
                        this.logEvent({message:`${opStr}: could not create device `,DeviceClass})
                        return;
                    }
                    
                    try {
                        this.logEvent({message:`${opStr}: connecting `,device:d.name, profile:d.getProfile(), address:d.address })
                        await d.connect();
                    }
                    catch(err) {
                        this.logEvent({message:'error', fn:'onPeripheralFound()',error:err.message||err, stack:err.stack})
                    }

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
                        this.logEvent({message:`${opStr}: device found`, device:d.name, profile:d.getProfile(), address:d.address, services:d.services.join(',')});
                        this.addDeviceToCache( d,peripheral.state==='connected')
                        
                        devicesProcessed.push(d)
                        this.emit('device', d)
                        return;
                    }

                    if (scanForDevice&& cntFound>0)  {
                        this.logEvent({message:`${opStr}: device found`, device:d.name, profile:d.getProfile(), address:d.address, services:d.services.join(',')});
                        this.addDeviceToCache(d,peripheral.state==='connected')
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


//                })
            }
                
            this.logEvent({message:`${opStr}: start scanning`, requested: scanForDevice ? {name, address,profile}: undefined,timeout})
            /*
            this.peripheralCache.forEach( i => {
                onPeripheralFound(i.peripheral, true)
            })
            */
            
            let services = []
            if (scanForDevice && name && !name.toLowerCase().startsWith('tacx')) {
                if (props.requested instanceof BleDeviceClass) {
                    const device = props.requested as BleDeviceClass;
                    services  = (device.getServices()) || []                        
                }
            }

            bleBinding.startScanning(services, false, (err) => {                
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
    
    async stopScan() : Promise<boolean> {
        this.logEvent({message:'scan stop request'});

        if ( !this.scanState.isScanning) {
            this.logEvent({message:'scan stop result: not scanning'});
            return true;
        }

        if ( !this.getBinding())
            throw new Error('no binding defined') 

        this.getBinding().removeAllListeners('discover');

        const ongoing = this.peripheralCache.filter( i=> i.state.isLoading);
        if (ongoing)
            ongoing.forEach( i => {i.isInterrupted = true;})

        
        await this.getBinding().stopScanning();
        this.scanState.isScanning = false;
        this.logEvent({message:'scan stop result: success'});
        return true;
            
        
    }


    isScanning(): boolean {
        return this.scanState.isScanning===true
    }

    addConnectedDevice(device: BleDeviceClass):void { 
        const existigDevice = this.devices.find( i => i.device.id === device.id && i.device.getProfile()===device.getProfile())

        if (existigDevice) {
            existigDevice.isConnected = true;
            return
        }
        this.devices.push( {device,isConnected:true})            
    }

    addDeviceToCache( device: BleDeviceClass, isConnected:boolean): void {
        const existigDevice = this.devices.find( i => i.device.id === device.id && i.device.getProfile()===device.getProfile())

        if (existigDevice) {
            return
        }
        this.devices.push( {device,isConnected})                            
    }

    findConnected(device: BleDeviceClass|BlePeripheral): BleDeviceClass {
        const connected =  this.devices.find( i => i.device.id===device.id && i.isConnected)
        if (connected)
            return connected.device
        return undefined;
    }
    findDeviceInCache(device: { id?:string, address?:string, name?:string, profile:string}): BleDeviceClass {
        const existing =  this.devices.find( i => (i.device.id===device.id || i.device.address===device.address || i.device.name===device.name) && i.device.getProfile()===device.profile)
        return existing ? existing.device : undefined;
    }


    removeConnectedDevice(device: BleDeviceClass):void { 
        const existigDevice = this.devices.find( i => i.device.id === device.id)

        if (existigDevice) {
            existigDevice.isConnected = false;
            return
        }
        
    }

}