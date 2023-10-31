import { EventLogger } from 'gd-eventlog';
import BleAdapterFactory from './adapter-factory';

import {BleInterfaceProps,BlePeripheral, BleDeviceSettings, BleProtocol, BleBinding, BleInterfaceState, BleScanProps, BleCharacteristic, BleDeviceProperties} from './types'
import { BleComms } from './base/comms';
import { getCharachteristicsInfo, getPeripheralInfo, uuid } from './utils';
import { getBestDeviceMatch, getServicesFromProtocols } from './base/comms-utils';
import { IncyclistInterface,IncyclistScanProps } from '../types'
import BleAdapter from './base/adapter';
import BlePeripheralCache, { PeripheralCacheItem } from './peripheral-cache';
import EventEmitter from 'events';
import { sleep } from '../utils/utils';
import { BleDeviceData } from './base/types';

const DEFAULT_SCAN_TIMEOUT = 20000;

export interface ScanState {
    isScanning: boolean;
    isConnecting: boolean;
    isBackgroundScan: boolean;
    timeout?: NodeJS.Timeout;
    peripherals?: Map<string, BlePeripheral>;
    detected?: string[];
    emitter?: EventEmitter
}

export interface ConnectState {
    isConnecting: boolean;
    isConnected: boolean;
    timeout?: NodeJS.Timeout;
    isInitSuccess: boolean;
}


export interface BleDeviceInfo { 
    device: BleComms;
    isConnected: boolean;
}

export interface BleDeviceClassInfo { 
    Class: typeof BleComms,
    type: string
    services: string[];
    id: string;
}



export default class BleInterface  extends EventEmitter implements IncyclistInterface {
    scanState: ScanState = { isScanning: false, isConnecting:false,  timeout: undefined, isBackgroundScan:false}
    connectState: ConnectState = { isConnecting: false, isConnected: false,isInitSuccess: false }
    
    peripheralCache: BlePeripheralCache;                       // peripherals that were detected in current and previous scans
    logger: EventLogger
    props:BleInterfaceProps 
    binding: BleBinding
    sensorIsConnecting : boolean
    emittingAdapters: {comms:BleComms, cb:(data)=>void}[] = []
    loggingPaused: boolean
    
    
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

    constructor(props: BleInterfaceProps={}) { 
        super()
        this.props = props;
        if (props.binding)
            this.setBinding(props.binding)

        this.peripheralCache = new BlePeripheralCache();

        if ( props.logger ) 
            this.logger = props.logger
        else 
            this.logger = new EventLogger( 'BLE');
        this.loggingPaused = false;
    }

    getBinding(): BleBinding { return this.binding }
    setBinding(binding: BleBinding) { if(binding) this.binding = binding }
    getName(): string {
        return 'ble' 
    }

    protected getReconnectPause(): number {
        return 1000;
    }


    startConnectSensor() {
        this.sensorIsConnecting = true
    }

    stopConnectSensor() {
        this.sensorIsConnecting = false
    }

    async waitForSensorConnectionFinish():Promise<void> {
        while (this.sensorIsConnecting && this.connectState.isConnected) {
            await sleep(100)
        }
        return;
    }

    getAdapterFactory() {
        return BleAdapterFactory.getInstance()
    }

    pauseLogging(debugOnly=false) {
        if (this.loggingPaused)
            return;

        this.logEvent({message:'pause logging on BLE Interface',debugOnly})
        this.loggingPaused = debugOnly

        try {
            this.getBinding().pauseLogging()        
        }
        catch{}
    }

    resumeLogging() {
        if (!this.loggingPaused)
            return;

        const event = {message:'resume logging on BLE Interface'}

        // log this event - as logger is paused, we can't use this.logEvent()
        this.logger.logEvent(event)
        if (this.isDebugEnabled()) {
            console.log( '~~~ BLE', event)
        }

        this.loggingPaused = false

        try {
            this.getBinding().resumeLogging()
        }
        catch{}

    }

    protected isDebugEnabled() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
    
        if (w?.DEVICE_DEBUG||process.env.BLE_DEBUG) {
            return true;
        }
        return false
    }

    protected logEvent(event) {
        if ( this.logger && !this.loggingPaused) {
            this.logger.logEvent(event)
        }
   
        if (this.isDebugEnabled()) {
            console.log( '~~~ BLE', event)
        }
    }


    protected onStateChange(state:BleInterfaceState) {        
        if(state !== 'poweredOn'){       
            this.logEvent({message:'Ble disconnected',});

            this.connectState.isConnected = false;
            this.stopConnectSensor()
        } else {
            this.connectState.isConnected = true;
        }         
    }

    protected onError(err) {
        this.logEvent({message:'error', error:err.message, stack:err.stack});
    }

    connect(to?:number): Promise<boolean> {
        this.resumeLogging()
        const timeout = this.props.timeout || to  || 2000;


        return new Promise((resolve, reject) => {
            if ( this.connectState.isConnected) {
                return resolve(true);
            }
            this.logEvent({message:'Ble connect request',});
            
            if ( !this.getBinding()) 
                return Promise.reject(new Error('no binding defined')) 

                
            this.connectState.timeout = setTimeout( ()=>{
                this.connectState.isConnected= false;
                this.connectState.isConnecting=false;
                this.connectState.timeout= null;                    
                this.logEvent( {message:'Ble connect result: timeout'});
                resolve( false)
            }, timeout)

            try {


                const state = this.getBinding().state
                if(state === 'poweredOn' ){
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
    
                    this.getBinding().on('stateChange', (state:BleInterfaceState) => {
                        if(state === 'poweredOn'){
                            clearTimeout(this.connectState.timeout)
                            this.connectState.timeout= null;       
    
                            this.getBinding().removeAllListeners('stateChange')
                            this.getBinding().on('stateChange', this.onStateChange.bind(this))
    
                            this.connectState.isConnected = true;
                            this.connectState.isConnecting = false;
                            this.logEvent({message:'Ble connect result: success'});

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
                this.logEvent({message:'Ble connect result: error', error:err.message});
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

        const devices = this.getAdapterFactory().getAllInstances()
        const connectedDevices = devices.filter( d => d.isConnected());
        for (let i=0; i<connectedDevices.length; i++) { 
            const d = connectedDevices[i];
            await d.close();            
        }

        this.connectState.isConnected = false;
        this.connectState.isConnecting = false;
        if ( this.connectState.timeout) {
            clearTimeout(this.connectState.timeout)
            this.connectState.timeout= null;
        }
        this.logEvent({message:'disconnect result: success'});
        this.pauseLogging()
        return true;
    }

    isConnected(): boolean { 
        return this.connectState.isConnected;
    }

    onDisconnect(peripheral):void {        
        this.peripheralCache.remove(peripheral)        
    }

    protected async scannerWaitForConnection(tsTimeoutExpired?: number) {

        const timeoutExpired = () => {
            if (!tsTimeoutExpired)
                return false
            return Date.now() >= tsTimeoutExpired
        }

        while (!this.isConnected() && this.scanState.isScanning && !timeoutExpired()) {
            const connected = await this.connect();
            if (!connected)
                await sleep(this.getReconnectPause());
        }
    }



    protected async getCharacteristics( peripheral:BlePeripheral):Promise<BleCharacteristic[]> {
        let characteristics = undefined;
        let chachedPeripheralInfo:PeripheralCacheItem = this.peripheralCache.find( {peripheral})

        // was peripheral already detected in recent scan?
        if (chachedPeripheralInfo &&  Date.now()-chachedPeripheralInfo.ts>600000) {
            chachedPeripheralInfo.ts = Date.now()
        }                
        if (!chachedPeripheralInfo) {                         
            chachedPeripheralInfo=  this.peripheralCache.add({address:peripheral.address, ts:Date.now(), peripheral});
        }

        const connector = chachedPeripheralInfo.connector;

        if ( !chachedPeripheralInfo.characteristics) {
            try {
                
                chachedPeripheralInfo.state = { isConfigured:false, isLoading:true, isInterrupted:false}
                await connector.connect();
                peripheral.state = connector.getState();
                
                const initialized = await connector.initialize();
                if (!initialized)
                    return null;

                characteristics = connector.getCharachteristics();
                this.logEvent( {message:'characteristic info (+):', address:peripheral.address, info:characteristics.map(getCharachteristicsInfo)})

                chachedPeripheralInfo.characteristics = characteristics
                chachedPeripheralInfo.state = { isConfigured:true, isLoading:false, isInterrupted:false}

            }
            catch(err) {
                console.log ('~~ ERROR',err)
            }
        }
        else {
            characteristics = chachedPeripheralInfo.characteristics                        
            this.logEvent( {message:'characteristic info (*):',address:peripheral.address, info:characteristics.map(getCharachteristicsInfo)})

        }

        if (!characteristics)
            this.logEvent( {message:'characteristic info:', info:'none'})

        return characteristics;

    }

    protected waitForScanFinished( timeout) {
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

    protected async onPeripheralFound (p:BlePeripheral, callback, props:{request?:BleDeviceSettings, comms?:BleComms, protocolFilter?:BleProtocol[]|null} ={})   {                
        let peripheral = p;
        if ( !peripheral ||!peripheral.advertisement || !peripheral.advertisement.localName  /*|| (!props.comms && !peripheral.advertisement.serviceUuids)*/ ) {
            return
        }
        
        const scanForDevice = (props.comms!==undefined) || (props.request!==undefined && props.request!==null)    
        const request = props.comms ? props.comms.getSettings() : props.request

        if (scanForDevice && this.scanState.peripherals.size>0) {
            //this.logEvent({message:'search device: found device - above limits',peripheral:getPeripheralInfo(peripheral), })
            return;
        }

        

        if (!this.scanState.peripherals)
            this.scanState.peripherals = new Map<string,BlePeripheral>()


        // I found some scans (on Mac) where address was not set
        if (peripheral.address===undefined || peripheral.address==='')
            peripheral.address = peripheral.id || peripheral.name;

        // check if same device was already processed in current scan
        const isPeripheralProcessed = this.scanState.peripherals.get( peripheral.address)!==undefined;
        if (isPeripheralProcessed) {
            return;
        }

        if (scanForDevice) {
            const alreadyDetected = this.scanState.detected?.find( p => p===peripheral.address)!==undefined
            if (alreadyDetected)
                return;
            this.scanState.detected.push(peripheral.address)
        }

        // If we are in a device scan, check if we have found the requested device, otherwise stop
        if (scanForDevice) {
            let found:boolean = false;
            found = 
                (request.name!==undefined && peripheral.advertisement && request.name===peripheral.advertisement.localName) ||
                (request.address!==undefined && request.address===peripheral.address)           
            this.logEvent({message:'search device: found device',peripheral:getPeripheralInfo(peripheral), scanForDevice, matching:found})
            if (!found) {
                return;
            }

            // mark peripheral as processed in current scan
            this.scanState.peripherals.set(peripheral.address,peripheral)

            const characteristics = await this.getCharacteristics(peripheral)   
            if (characteristics) {
                callback(peripheral,characteristics)
            }
            else {
                callback(null)
            }
            this.stopScan()
            return;
        }
        else { // normal scan
            this.logEvent({message:'BLE scan: found device',peripheral:getPeripheralInfo(peripheral), scanForDevice, callback: callback!==undefined})

            // mark peripheral as processed in current scan
            this.scanState.peripherals.set(peripheral.address,peripheral)

            const {protocolFilter} = props;
            const connector = this.peripheralCache.getConnector(p);
            const characteristics = await this.getCharacteristics(p)
            if (!characteristics) {
                return callback(null);
            }

    
            const announcedServices = connector.getServices();
            
            const services = announcedServices ? announcedServices.map(uuid) : undefined;
            peripheral = connector.getPeripheral();
            //const {id,name,address,advertisement={}} = connectedPeripheral;  
    
            const DeviceClasses = this.getAdapterFactory().getDeviceClasses(peripheral,{services}) || [];

            const MatchingClasses = protocolFilter && DeviceClasses ? DeviceClasses.filter(C=> protocolFilter.includes(C.protocol)) : DeviceClasses
            const DeviceClass = getBestDeviceMatch(MatchingClasses.filter(C=> C.isMatching(characteristics.map(c=>c.uuid))))
            this.logEvent({message:'BLE scan: device connected',peripheral:getPeripheralInfo(peripheral),services, protocols:DeviceClasses.map(c=>c.protocol), found:DeviceClass!==undefined })                
    
            
            if (!DeviceClass)
                return callback(null);

            const {id,name,address} = getPeripheralInfo(peripheral)

            const settings = { protocol:DeviceClass.protocol, interface:'ble', id,name:peripheral.name||name, address:peripheral.address||address  }           
            callback(settings, characteristics, peripheral)
        }
    }
       

    async scanForDevice( comms:BleComms, props:IncyclistScanProps): Promise<BlePeripheral> {

        const {timeout=DEFAULT_SCAN_TIMEOUT } = props;
        const request = comms.getSettings();
        const {protocol} = request
        const ble = this.getBinding()

        try {
            this.getBinding().setServerDebug(true)
        }
        catch {}
                
        if (!this.isConnected()) {
            await this.connect();
        }      

        const device = BleAdapterFactory.getInstance().createInstance(request)
        if (device.isConnected())
            return device.getComms().peripheral
   
        let opStr;
        opStr = 'search device';
        this.logEvent({message:'search device request',request});


        // if scan is already in progress, wait until previous scan is finished 
        if ( this.scanState.isScanning) {
            try {
                this.logEvent({message:`${opStr}: waiting for previous scan to finish`});
                await this.waitForScanFinished(timeout)
            }
            catch(err) {
                this.logEvent({message:`${opStr} result: already scanning`, error:err.message});
                throw (err)
            }
        }        

        return new Promise( (resolve, reject) => {

            this.scanState.isScanning = true;
            this.scanState.peripherals = new Map<string,BlePeripheral>()
            this.scanState.detected = []

            const onTimeout = ()=>{                               
                if (!this.scanState.isScanning || !this.scanState.timeout)
                    return;

                this.scanState.timeout = null;
                this.logEvent({message:`${opStr} result: timeout`, request});
                ble.removeAllListeners('discover');
                this.logEvent({message:`${opStr}: stop scanning`, request})
                ble.stopScanning ( ()=> {
                    this.scanState.isScanning = false;                    

                    try {
                        this.getBinding().setServerDebug(false)
                    }
                    catch {}
            
                    reject( new Error('device not found'))
                    return 
                })
            }
 
            this.logEvent({message:`${opStr}: start scanning`, request,timeout})
            
            let services = []
            //special cases TACX, it does not alway announce the services, therefore we need to look for all servcies
            if (protocol!=='tacx') {
                services  = (device.getComms().getServices()) || []                        
            }

            ble.startScanning(services, true, (err) => {                
                if (err) {
                    this.logEvent({message:`${opStr} result: error`, request,error:err.message});
                    this.scanState.isScanning = false;
                    return reject(err)
                }
                ble.on('discover', (p:BlePeripheral )=> {
                    
                    this.onPeripheralFound(p,(peripheral:BlePeripheral,characteristics:BleCharacteristic[])=>{

                        if (!peripheral)
                            return reject( new Error('could not connect'))

                        device.getComms().characteristics = characteristics

                        process.nextTick( ()=> {
                            if (this.scanState.timeout) {
                                clearTimeout(this.scanState.timeout)
                                this.scanState.timeout= null;
                            }
                            this.logEvent({message:`${opStr}: stop scanning`, request })
            
                            ble.stopScanning ( ()=> {
                                ble.removeAllListeners('discover');
                                this.scanState.isScanning = false;

                                try {
                                    this.getBinding().setServerDebug(false)
                                }
                                catch {}
                        
                                resolve(peripheral)
                            })
            
                        })
                            
                        
                        
            
                        
                    },{comms}) 
                })
                const cachedItem = this.peripheralCache.find(request)
                if (cachedItem) {
                    this.logEvent({message:`${opStr}: adding peripheral from cache `, peripheral:getPeripheralInfo(cachedItem.peripheral)})
                    ble.emit('discover',cachedItem.peripheral)
                }

            })
            this.scanState.timeout = setTimeout( onTimeout, timeout)
        })            
    }

    async scan( props:BleScanProps={}) : Promise<BleDeviceSettings[]> {
        this.resumeLogging()
        this.logEvent({message:'starting scan ..'})

        const {timeout, protocol,protocols } = props;

        const requestedProtocols = protocols || []
        if (protocol && !requestedProtocols.find(p => p===protocol))
            requestedProtocols.push(protocol)
        
        const protocolFilter = requestedProtocols.length>0 ? requestedProtocols : null;
        const services =  protocolFilter===null ? this.getAdapterFactory().getAllSupportedServices() : getServicesFromProtocols(protocolFilter)
        const ble = this.getBinding()
        if ( !ble)
            throw new Error('no binding defined') 


        // if scan is already in progress, wait until previous scan is finished 
        const opStr = 'scan'
        if ( this.scanState.isScanning) {
            try {
                this.logEvent({message:`${opStr}: waiting for previous scan to finish`});
                await this.waitForScanFinished(timeout)
            }
            catch(err) {
                this.logEvent({message:`${opStr} result: already scanning`});
                throw (err)
            }
        }

        this.scanState.isScanning = true;
        this.scanState.emitter = new EventEmitter()

        const tsStart = Date.now()
        const tsTimeoutExpired = timeout ? tsStart+timeout : undefined
        await this.scannerWaitForConnection(tsTimeoutExpired);

        // if timeout has expired or scan was stopped in the meantime
        if ( Date.now()>tsTimeoutExpired || !this.scanState.isScanning) {
            return []
        }

        const adjustedScanTimeout = timeout 

        const supported = BleAdapterFactory.getInstance().getAll().map(i => i.protocol )
        this.logEvent({message:'scan start', services,supported});


        return new Promise( (resolve, reject) => {
            this.scanState.peripherals = new Map<string,BlePeripheral>()
            const detected:BleDeviceSettings[] = [];
            const requested = protocolFilter;

            const onTimeoutOrStopped = async (wasTimeout=false)=>{                               
                if (!this.scanState.isScanning || !this.scanState.timeout)
                    return;

                if (this.scanState.timeout) {
                    clearTimeout(this.scanState.timeout)
                    this.scanState.timeout = null;
                }

                const devices = detected.map( d => {
                    const { id,name,address,protocol } = d
                    return { id,name,address,protocol }
                } )

                if (wasTimeout)
                    this.logEvent({message:`${opStr} result: timeout, devices found`, requested , devices});

                ble.removeAllListeners('discover');
                
                await ble.stopScanning ( )
                resolve(detected)
              
                
                this.emittingAdapters.forEach( a=> {
                    a.comms.off('data',a.cb)                    
                    a.comms.unsubscribeAll()
                })
                this.emittingAdapters = []
                
                this.emit('scan stopped',true)
            }

            if (timeout)
                this.scanState.timeout = setTimeout( onTimeoutOrStopped, adjustedScanTimeout)

            this.scanState.emitter.on('stop',()=>{
                this.emit('stop-scan')
                onTimeoutOrStopped()
                
            })

            ble.startScanning(protocolFilter? services : [], false, (err) => {                
                if (err) {
                    this.logEvent({message:`${opStr} result: error`, requested,error:err.message});
                    this.scanState.isScanning = false;
                    return reject(err)
                }
                ble.on('discover', (p )=> {
                    this.onPeripheralFound(p, async (deviceSettings:BleDeviceSettings, characteristics: BleCharacteristic[],peripheral:BlePeripheral)=>{                        
                        if (deviceSettings) {
                            detected.push(deviceSettings)
                            const device = this.getAdapterFactory().createInstance(deviceSettings) as BleAdapter<BleDeviceData,BleComms>
                            
                            device.getComms().characteristics = characteristics
                            device.getComms().peripheral = peripheral

                            try {
                                await device.getComms().subscribeAll()
                                const cb = (deviceData) => { this.emit('data', deviceSettings, deviceData)}
                                device.getComms().on('data', cb)
                                this.emittingAdapters.push( {comms:device.getComms(),cb})
                            }
                            catch {}
                            
                            
                            this.emit('device',deviceSettings)

                        }
                    },{protocolFilter}) 
                })

                const cachedItems = this.peripheralCache.filter(protocolFilter? services : [])
                if (cachedItems && cachedItems.length>0) {
                    cachedItems.map(c=>c.peripheral).forEach( peripheral=> {
                        this.logEvent({message:`${opStr}: adding peripheral from cache `, peripheral:getPeripheralInfo(peripheral)})
                        ble.emit('discover',peripheral)
    
                    })
                }

            })


        })            
    
    }

    async stopScan() : Promise<boolean> {
        this.logEvent({message:'stopping scan ..'})
        this.pauseLogging(true)

        if (!this.isScanning()) {
            this.logEvent({message:'stopping scan done ..'})            
            return true;
        }

        await  new Promise<boolean>( done => {
            this.scanState.emitter?.emit('stop')
            this.once('scan stopped',(res)=>{
                done(res)
            })
        })
        this.scanState.isScanning = false;
        
        this.logEvent({message:'stopping scan done ..'})
        return true;

    }

    isScanning(): boolean {
        return this.scanState.isScanning===true
    }





}