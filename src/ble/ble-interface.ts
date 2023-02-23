import { EventLogger } from 'gd-eventlog';
import { BleScanProps, BleState,BleBinding, } from './ble'
import BleAdapterFactory from './adapter-factory';

import {BleInterfaceProps,BlePeripheral, BleDeviceSettings, BleProtocol} from './types'
import { BleComms } from './base/comms';
import { getCharachteristicsInfo, getPeripheralInfo, uuid } from './utils';
import { getBestDeviceMatch, getServicesFromProtocols } from './base/comms-utils';
import { EventEmitter } from 'stream';
import { IncyclistInterface } from '../types/interface';
import BleAdapter from './adapter';
import { IncyclistScanProps } from '../types/device';
import BlePeripheralCache from './peripheral-cache';

const CONNECT_TIMEOUT = 5000;
const DEFAULT_SCAN_TIMEOUT = 20000;

export interface ScanState {
    isScanning: boolean;
    isConnecting: boolean;
    isBackgroundScan: boolean;
    timeout?: NodeJS.Timeout;
    peripherals?: Map<string, BlePeripheral>;
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
    connectedDevices: BleAdapter[]
    
    
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
        this.connectedDevices = [];

        if ( props.logger ) 
            this.logger = props.logger
        else 
            this.logger = new EventLogger( 'BLE');

    }

    getBinding(): BleBinding { return this.binding }
    setBinding(binding: BleBinding) { if(binding) this.binding = binding }
    getName(): string {
        return 'ble'
     }
    

    getAdapterFactory() {
        return BleAdapterFactory.getInstance()
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

    connect(): Promise<boolean> {
        
        const timeout = this.props.timeout || 2000;


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
        return true;
    }

    isConnected(): boolean { 
        return this.connectState.isConnected;
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


    onDisconnect(peripheral):void {        
        this.peripheralCache.remove(peripheral)
    }

    async getCharacteristics( peripheral:BlePeripheral) {
        let characteristics = undefined;
        let chachedPeripheralInfo = this.peripheralCache.find( {peripheral})

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
                
                await connector.initialize();
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

    async onPeripheralFound (p:BlePeripheral, callback, props:{request?:BleDeviceSettings, comms?:BleComms, protocolFilter?:BleProtocol[]|null} ={})   {                
        let peripheral = p;
        if ( !peripheral ||!peripheral.advertisement || !peripheral.advertisement.localName  || !peripheral.advertisement.serviceUuids ) 
            return
        
        const scanForDevice = props.comms || (props.request!==undefined && props.request!==null)    
        const request = props.comms ? props.comms.getSettings() : props.request
            
        this.logEvent({message:'BLE scan: found device',peripheral:getPeripheralInfo(peripheral)})

        if (!this.scanState.peripherals)
            this.scanState.peripherals = new Map<string,BlePeripheral>()


        // I found some scans (on Mac) where address was not set
        if (peripheral.address===undefined || peripheral.address==='')
            peripheral.address = peripheral.id;

        // check if same device was already processed in current scan
        const isPeripheralProcessed = this.scanState.peripherals.get( peripheral.address)!==undefined;
        if (isPeripheralProcessed)
            return;

        // mark peripheral as processed in current scan
        this.scanState.peripherals.set(peripheral.address,peripheral)

        // If we are in a device scan, check if we have found the requested device, otherwise stop
        if (scanForDevice) {
            let found:boolean = false;
            found = 
                (request.name && peripheral.advertisement && request.name===peripheral.advertisement.localName) ||
                (request.address && request.address===peripheral.address)           
            if (!found)
                return;
            
            await this.getCharacteristics(peripheral)   
            
            return callback(peripheral)
        }
        else { // normal scan
            const {protocolFilter} = props;
            const connector = this.peripheralCache.getConnector(p);
            await this.getCharacteristics(p)
    
            const announcedServices = connector.getServices();
            
            const services = announcedServices ? announcedServices.map(uuid) : undefined;
            peripheral = connector.getPeripheral();
            //const {id,name,address,advertisement={}} = connectedPeripheral;  
    
            const DeviceClasses = this.getAdapterFactory().getDeviceClasses(peripheral,{services}) || [];

            const MatchingClasses = protocolFilter && DeviceClasses ? DeviceClasses.filter(C=> protocolFilter.includes(C.protocol)) : DeviceClasses
            const DeviceClass = getBestDeviceMatch(MatchingClasses);                        
            this.logEvent({message:'BLE scan: device connected',peripheral:getPeripheralInfo(peripheral),services, protocols:DeviceClasses.map(c=>c.protocol) })                
    
            
            if (!DeviceClass)
                return callback(null);

            const {id,name,address} = getPeripheralInfo(peripheral)

            const settings = { protocol:DeviceClass.protocol, interface:'ble', id,name:peripheral.name||name, address:peripheral.address||address  }           
            callback(settings)
        }
    }
       

    async scanForDevice( comms:BleComms, props:IncyclistScanProps): Promise<BlePeripheral> {

        const {timeout=DEFAULT_SCAN_TIMEOUT } = props;
        const request = comms.getSettings();
        const {protocol} = request
        const ble = this.getBinding()
                
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

            const onTimeout = ()=>{                               
                if (!this.scanState.isScanning || !this.scanState.timeout)
                    return;

                this.scanState.timeout = null;
                this.logEvent({message:`${opStr} result: device found`, request});
                ble.removeAllListeners('discover');
                this.logEvent({message:`${opStr}: stop scanning`, request})
                ble.stopScanning ( ()=> {
                    this.scanState.isScanning = false;                    
                    reject( new Error('device not found'))
                    return 
                })
            }
 
            this.logEvent({message:`${opStr}: start scanning`, request,timeout})
            
            let services = []
            // special cases TACX, it does not alway announce the services, therefore we need to look for all servcies
            if (protocol==='tacx') {
                services  = (device.getComms().getServices()) || []                        
            }

            ble.startScanning(services, false, (err) => {                
                if (err) {
                    this.logEvent({message:`${opStr} result: error`, request,error:err.message});
                    this.scanState.isScanning = false;
                    return reject(err)
                }
                ble.on('discover', (p:BlePeripheral )=> {
                    this.onPeripheralFound(p,(peripheral:BlePeripheral)=>{

                        process.nextTick( ()=> {
                            if (this.scanState.timeout) {
                                clearTimeout(this.scanState.timeout)
                                this.scanState.timeout= null;
                            }
                            this.logEvent({message:`${opStr}: stop scanning`, request })
            
                            ble.stopScanning ( ()=> {
                                ble.removeAllListeners('discover');
                                this.scanState.isScanning = false;
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
        const {timeout=DEFAULT_SCAN_TIMEOUT, protocol,protocols } = props;

        const requestedProtocols = protocols || []
        if (protocol && !requestedProtocols.find(p => p===protocol))
            requestedProtocols.push(protocol)
        
        const protocolFilter = requestedProtocols.length>0 ? requestedProtocols : null;
        const services =  protocolFilter===null ? this.getAdapterFactory().getAllSupportedServices() : getServicesFromProtocols(protocolFilter)
        const ble = this.getBinding()
        if (!this.isConnected()) {
            await this.connect();
        }

        const opStr = 'scan'
        const supported = BleAdapterFactory.getInstance().getAll().map(i => i.protocol )
        this.logEvent({message:'scan start', services,supported});

        // if scan is already in progress, wait until previous scan is finished 
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

        return new Promise( (resolve, reject) => {
            this.scanState.isScanning = true;
            this.scanState.peripherals = new Map<string,BlePeripheral>()
            const detected:BleDeviceSettings[] = [];
            const requested = protocolFilter;

            const onTimeout = ()=>{                               
                if (!this.scanState.isScanning || !this.scanState.timeout)
                    return;

                this.scanState.timeout = null;
                const devices = detected.map( d => {
                    const { id,name,address,protocol } = d
                    return { id,name,address,protocol }
                } )
                this.logEvent({message:`${opStr} result: devices found`, requested , devices});
                ble.removeAllListeners('discover');
                this.logEvent({message:`${opStr}: stop scanning`, requested})
                ble.stopScanning ( ()=> {
                    this.scanState.isScanning = false;
                    resolve(detected)
                })
            }

            this.logEvent({message:`${opStr}: start scanning`, requested ,timeout})           

            this.scanState.timeout = setTimeout( onTimeout, timeout)
            ble.startScanning(protocolFilter? services : [], false, (err) => {                
                if (err) {
                    this.logEvent({message:`${opStr} result: error`, requested,error:err.message});
                    this.scanState.isScanning = false;
                    return reject(err)
                }
                ble.on('discover', (p )=> {
                    this.onPeripheralFound(p,(deviceSettings:BleDeviceSettings)=>{                        
                        if (deviceSettings) {
                            this.emit('device',deviceSettings)
                            detected.push(deviceSettings)
                            this.getAdapterFactory().createInstance(deviceSettings)

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
        this.logEvent({message:'scan stop request'});

        if ( !this.scanState.isScanning) {
            this.logEvent({message:'scan stop result: not scanning'});
            return true;
        }

        const ble = this.getBinding()
        if ( !ble)
            throw new Error('no binding defined') 

        ble.removeAllListeners('discover');
        this.peripheralCache.handleStopScan()       
        ble.stopScanning();

        this.scanState.isScanning = false;
        this.logEvent({message:'scan stop result: success'});
        return true;                    
    }


    isScanning(): boolean {
        return this.scanState.isScanning===true
    }



    addConnectedDevice(device:BleAdapter):void {
        const idx = this.connectedDevices.findIndex( d => d.isSame(device))
        if (idx===-1)
            this.connectedDevices.push(device)
    }


    removeConnectedDevice(device: BleAdapter):void { 
        const idx = this.connectedDevices.findIndex( d => d.isSame(device))
        if (idx!==-1)
            this.connectedDevices.splice(idx)
    }

}