import { EventLogger } from "gd-eventlog";
import { BleInterfaceClass } from "./ble";
import BlePeripheralConnector from "./ble-peripheral";
import { matches,uuid } from "./utils";
import {BleDeviceCommsClass,ConnectProps,BleDeviceInfo,BlePeripheral,BleDeviceProps,BleCharacteristic, BleWriteProps} from './types'
import BleInterface from "./ble-interface";

const CONNECT_WAIT_TIMEOUT = 10000;
const BLE_TIMEOUT = 1000;

interface BleDeviceConstructProps extends BleDeviceProps {
    log?: boolean;
    logger?: EventLogger;
    peripheral?: BlePeripheral
}

type CommandQueueItem = {
    uuid: string,
    data: Buffer,
    timeout: number,
    resolve, 
    reject
}

export interface MessageLog {
    uuid: string, 
    timestamp,
    data: string
}


export class BleComms extends BleDeviceCommsClass  {

    id: string;
    address: string;
    name: string;
    services: string[];
    ble: BleInterfaceClass;
    peripheral?: BlePeripheral;
    characteristics = []
    state?: string;
    logger?: EventLogger;
    deviceInfo: BleDeviceInfo = {};
    isInitialized: boolean;
    subscribedCharacteristics: string[]
    writeQueue: CommandQueueItem[];
    workerIv: NodeJS.Timeout;
    prevMessages: MessageLog[] 

    constructor (props?: BleDeviceConstructProps) {
        super()

        this.id = props.id;
        this.address =props.address;
        this.name = props.name;
        this.services = props.services;
        this.ble = BleInterface.getInstance()
        this.characteristics = []
        this.subscribedCharacteristics = [];
        this.isInitialized = false;
        this.writeQueue = [];
        this.workerIv = null;
        this.prevMessages = []

        if (props.peripheral) {
            const {id,address,advertisement,state} = props.peripheral;
            this.peripheral = props.peripheral
            this.id = id;
            this.address =address;
            this.name = advertisement.localName; 
            this.services = advertisement.serviceUuids;
            this.state = state      
                  
        }

        if (props.logger) { 
            this.logger = props.logger;
        }
        else if (props.log!==false) {
            this.logger = new EventLogger('BleDevice');
        }

    }
    getServiceUUids(): string[] {
        throw new Error("Method not implemented.");
    } 
    getProfile(): string { 
        throw new Error("Method not implemented.");

    }

    getServices(): string[] {
        return this.services;
    }

    logEvent(event) {
        if ( this.logger) {
            this.logger.logEvent(event)
        }
        if (process.env.BLE_DEBUG) {
            console.log( '~~~BLE:', event)
        }
    }  

    setLogger(logger: EventLogger) {
        this.logger = logger
    }

    setInterface(ble: BleInterfaceClass): void { 
        this.ble = ble;
    }

    isMatching(characteristics: string[]) {
        return true;
    }

    reset() {

    }

    cleanupListeners():void { 
        //console.log('~~cleanup', this.characteristics)
        if ( this.characteristics === undefined) {
            this.characteristics = []
        }
        else {
            const connector = this.ble.getConnector(this.peripheral);

            this.characteristics.forEach( c => {            
                connector.removeAllListeners(uuid(c.uuid));
            })
            //this.characteristics = []
        }    
    }

    onDisconnect() { 
        this.logEvent( {message:'device disconnected', address:this.address, profile:this.getProfile()})
        this.state = "disconnected"

        // reconnect
        if ( !this.connectState.isDisconnecting) {
            this.peripheral.state= 'disconnected'
            this.connectState.isConnecting = false;
            this.connectState.isConnected = false;

            this.cleanupListeners();
            this.subscribedCharacteristics  = [];
            
            this.ble.onDisconnect(this.peripheral)

            // reconnect
            this.connect( {reconnect:true}) 
        }
        this.emit('disconnected')    
    }


    waitForConnectFinished( timeout) {
        const waitStart = Date.now();
        const waitTimeout = waitStart + timeout;

        return new Promise( (resolve, reject) => {
            const waitIv = setInterval( ()=>{
                try {
                    if (this.connectState.isConnecting && Date.now()>waitTimeout)  {
                        clearInterval(waitIv)
                        return reject(new Error('connection already in progress'))
                    }
                    if (!this.connectState.isConnecting) {
                        clearInterval(waitIv)
                        return resolve(true)
                    }
    
                }
                catch( err) { console.log('~~~ error',err)}
    
            }, 100)
    
        })

    }

    hasService( serviceUuid) : boolean {
        return this.services && this.services.find( s=> s===serviceUuid || uuid(serviceUuid))!==undefined
    }

    async init(): Promise<boolean> {
        //if (this.isInitialized)
        //    return Promise.resolve(true);

        return await this.initDevice()
    }

    initDevice(): Promise<boolean> {
        this.logEvent({message: 'get device info'})

        return this.getDeviceInfo().then( ()=> { 
            this.emit('deviceInfo',this.deviceInfo)

            this.logEvent({message:'device init done',...this.deviceInfo})
            this.isInitialized = true;

            return true;
        })    

    }

    async connectPeripheral  (peripheral: BlePeripheral)   {

        this.connectState.isConnecting = true;


        try {
            const connector = this.ble.getConnector(peripheral)

            connector.on('disconnect',()=>{this.onDisconnect()})
            await connector.connect();
            await connector.initialize();
            await this.subscribeAll(connector)

            this.connectState.isConnected = true;
            this.state = "connected"
            this.emit('connected')

            await this.init();

        }
        catch (err) {
            this.logEvent({message:'Error', fn:'connectPeripheral()', error:err.message, stack:err.stack})

        }
        this.connectState.isConnecting = false;
                  

    }

    

    async subscribeAll(conn?: BlePeripheralConnector):Promise<void> {

        try {
            const connector = conn || this.ble.getConnector(this.peripheral)
            const subscribed = await connector.subscribeAll( (uuid:string,data) => {this.onData(uuid,data)});
            subscribed.forEach( c => this.subscribedCharacteristics.push(c))

        }
        catch (err) {
            this.logEvent({message:'Error', fn:'subscribeAll()', error:err.message, stack:err.stack})

        }
    }


    async connect(props?: ConnectProps): Promise<boolean> {
        const {reconnect} = props||{}
        try {
            this.logEvent( {message: reconnect? 'reconnect': 'connect',address: this.peripheral? this.peripheral.address: this.address, state:this.connectState})
            if (!reconnect && this.connectState.isConnecting) {
                await this.waitForConnectFinished(CONNECT_WAIT_TIMEOUT)
            }
    
            // already connected ? 
            if ( this.connectState.isConnected) {

                try {
                    await this.subscribeAll();
                    await this.init()
                }
                catch(err) {
                    this.logEvent({message:'cannot reconnect', error: err.message||err })
                    return false;
                }

                return true;
            }


            this.connectState.isConnecting = true;
            if (!this.peripheral) {
                const {id,name,address } = this;
                // is there already a peripheral in the cache (from background scan or previous scan)?
                try {
                    this.peripheral = this.ble.findPeripheral({id,name,address})
                }
                catch(err) {
                    console.log('~~~ error',err)
                }
            }
    
            if ( this.peripheral) {
                const {id,address,advertisement } = this.peripheral;
                const name = advertisement?.localName;
                this.logEvent({message:'connect requested',mode:'peripheral', device: { id, name, address:address} })
                await this.connectPeripheral(this.peripheral)
                this.logEvent({message:'connect result: success',mode:'peripheral', device: { id, name, address} })
                return true;            
            }
            
            else {                
                // we need to scan for the device

                const {id,name,address } = this;
                let error;
                if ( this.address || this.id || this.name) {
                    
                    this.logEvent({message:'connect requested',mode:'device', device: { id, name, address} })
                    
                    try {
                        if (this.ble.isScanning()) {
                            await this.ble.stopScan();
                        }            
        
                        const devices:BleComms[] = await this.ble.scan({requested:this}) as BleComms[];
                        if ( devices && devices.length > 0) {
                            this.peripheral = devices[0].peripheral;
                            await this.connectPeripheral(this.peripheral)
                            this.logEvent({message:'connect result: success',mode:'device', device:  { id, name, address}  })

                            this.connectState.isConnecting = false;
                            this.connectState.isConnected = true;
            

                            return true;
                        }
        
                    }
                    catch (err) {
                        console.log('~~~ error',err)
                        error = err;
                    }
                    
    
                }
                this.logEvent({message:'connect result: failure',mode:'device', device:  { id, name, address} , error:error.message, stack:error.stack })
                this.connectState.isConnecting = false;
                this.connectState.isConnected = false;
                return false;
            }
    
        }
        catch (err) {
            this.connectState.isConnecting = false;
            this.connectState.isConnected = false;
            this.logEvent({message:'connect result: error', error:err.message})
            return false;

        }
 
    }

    async disconnect(): Promise<boolean> {
        const {id,name,address } = this;
        this.logEvent({message:'disconnect requested',device: { id, name, address} })


        this.connectState.isDisconnecting = true;

        if (this.workerIv) {
            this.stopWorker();
        }

        if (!this.connectState.isConnecting && !this.connectState.isConnected) {
            this.connectState.isDisconnecting = false;
            this.connectState.isConnecting = false;
            this.connectState.isConnected = false;
            this.logEvent({message:'disconnect result: success',device: { id, name, address} })
            return true;
        }


        if (this.connectState.isConnecting) {
            // log warning
            this.cleanupListeners();
            // reconnect posible after 1s
            setTimeout(()=> { this.connectState.isDisconnecting = false; }, 1000)
            this.logEvent({message:'disconnect result: unclear - connect ongoing',device: { id, name, address} })
            this.connectState.isConnecting = false;
            this.connectState.isConnected = false;
            return true;
        }

        if (this.connectState.isConnected) { 
            this.ble.removeConnectedDevice(this)
            this.cleanupListeners();

            this.logEvent({message:'disconnect result: success',device: { id, name, address} })
            this.connectState.isDisconnecting = false;
            this.connectState.isConnecting = false;
            this.connectState.isConnected = false;

            return true;
        }
    }
   


    checkForDuplicate(characteristic:string, data: Buffer) {
        // don't process duplicate messages
        const prev = this.prevMessages.find( i => i.uuid===characteristic);
        if (prev) {
            if ( prev.data === data.toString('hex') && prev.timestamp>Date.now()-500) {
                prev.timestamp = Date.now();
                return true;
            }
            else {
                prev.data = data.toString('hex')
                prev.timestamp = Date.now();
            }
        }
        else {
            this.prevMessages.push( {uuid:characteristic, timestamp:Date.now(), data:data.toString('hex')})
            
        }
        return false;

    }

    onData(characteristic:string, _data: Buffer): boolean {
        const data:Buffer = Buffer.from(_data);

        const isDuplicate = this.checkForDuplicate(characteristic,data)
        if (isDuplicate) {
            //console.log('~~~ duplicate data',characteristic,data.toString('hex'))
            return false;
        }


        this.logEvent({message:'got data', characteristic,   data:data.toString('hex'), writeQueue:this.writeQueue.length})

        if (this.writeQueue.length>0 ) {
//            console.log('~~~ onData',characteristic,data.toString('hex'))
            const writeIdx = this.writeQueue.findIndex( i => matches(i.uuid,characteristic));            

            if (writeIdx!==-1) {
                const writeItem = this.writeQueue[writeIdx];

                
                this.writeQueue.splice(writeIdx,1);
                //console.log('~~~ write queue', this.writeQueue)
                if (writeItem.resolve)
                    writeItem.resolve(data)
                
                return false;
            }


        }
        return true;

    }

    timeoutCheck() {
        const now = Date.now();
        const updatedQueue = [];
        let hasTimeout = false;

        this.writeQueue.forEach( writeItem => {
            if (writeItem.timeout && writeItem.timeout<now) {
                if ( writeItem.reject) {
                    hasTimeout = true;
                    writeItem.reject( new Error('timeout'))
                }
            }
            else {
                updatedQueue.push(writeItem)
            }
        })

        if (hasTimeout)
            this.writeQueue = updatedQueue;
    }

    startWorker() {
        if (this.workerIv)
            return;
        this.workerIv = setInterval( ()=>{this.timeoutCheck()}, 100) 
    }

    stopWorker() {
        if (!this.workerIv)
            return;

        clearInterval(this.workerIv)
        this.workerIv = null;
    }


    async write( characteristicUuid:string, data:Buffer,props?:BleWriteProps): Promise<ArrayBuffer> {
            
        if (!this.isConnected())
            throw new Error('not connected')

        try {

            const {withoutResponse,timeout} = props||{};

            const connector = this.ble.getConnector( this.peripheral)
            const isAlreadySubscribed = connector.isSubscribed(characteristicUuid)

            if (!withoutResponse && !this.workerIv) {                
                this.startWorker();
            }

            //console.log('~~~ write ',characteristicUuid, data.toString('hex'), isAlreadySubscribed, this.subscribedCharacteristics)
            if ( !withoutResponse && !isAlreadySubscribed) {
                const connector = this.ble.getConnector( this.peripheral)
                connector.removeAllListeners(characteristicUuid)
                connector.on(characteristicUuid, (uuid,data)=>{ 
                    this.onData(uuid,data)
                })

                this.logEvent({message:'write:subscribing ', characteristic:characteristicUuid})
                await connector.subscribe(characteristicUuid)
                this.subscribedCharacteristics.push(characteristicUuid)
            }

            return new Promise ( (resolve,reject) => {
                const characteristic: BleCharacteristic = this.characteristics.find( c=> c.uuid===characteristicUuid || uuid(c.uuid)===characteristicUuid );
                if (!characteristic) {
                    reject(new Error( 'Characteristic not found'))
                    return;
                }

                if (withoutResponse) {
                    this.logEvent({message:'writing', data:data.toString('hex'),withoutResponse})
                    characteristic.write(data,withoutResponse);
                    resolve(new ArrayBuffer(0));
                    return;
                }
                else {
                    const writeId = this.writeQueue.length;
                    let messageDeleted = false;                    
                    const writeTimeout = timeout!==undefined ? timeout: BLE_TIMEOUT;
                    this.writeQueue.push( {uuid:characteristicUuid.toLocaleLowerCase(), data, timeout:Date.now()+writeTimeout, resolve, reject})
                    const to = setTimeout( ()=>{ 
                        if ( this.writeQueue.length>writeId && !messageDeleted)
                            this.writeQueue.splice(writeId,1);
                        this.logEvent({message:'writing response',err:'timeout'})
                        reject (new Error('timeout'))
                    },5000)

                    this.logEvent({message:'writing'})
                    characteristic.write(data,withoutResponse, (err) => {
                        clearTimeout(to);
                        this.logEvent({message:'writing response',err})
                        
                        if (err) {
                            this.writeQueue.splice(writeId,1);
                            messageDeleted = true;
                            reject(err)
                        }                    
                    })
    
                }

        
            })

        }
        catch(err) {
            this.logEvent({message:'error',fn:'write',error:err.message||err, stack:err.stack})
        }

    }

    read( characteristicUuid:string): Promise<Uint8Array> {
        return new Promise ( (resolve,reject) => {
            if (!this.isConnected())
                return reject( new Error('not connected'))

            const characteristic: BleCharacteristic = this.characteristics.find( c=> c.uuid===characteristicUuid || uuid(c.uuid)===characteristicUuid );
            if (!characteristic) {
                reject(new Error( 'Characteristic not found'))
                return;
            }
            characteristic.read( (err,data) => {
                if (err && data instanceof Error)
                    reject(err)
                else if (data instanceof Error)
                    reject(data)
                else 
                    resolve(data)
            })
    
        })
    }

    async getDeviceInfo(): Promise<BleDeviceInfo> {
        const info = this.deviceInfo;

        const readValue = async (c) => {
            try { 
                const b = await this.read(c)
                const buffer = b ? Buffer.from(b): undefined;
                return buffer ? buffer.toString() : undefined;
            }
            catch{ 
                return undefined
            }    
        }

        info.model = info.model || await readValue('2a24')
        info.serialNo = info.serialNo || await readValue('2a25')
        info.fwRevision = info.fwRevision || await readValue('2a26')
        info.hwRevision = info.hwRevision ||await readValue('2a27')
        info.swRevision = info.swRevision ||await readValue('2a28')
        info.manufacturer = info.manufacturer ||await readValue('2a29')

    
        this.deviceInfo = info;
        return info;

    }

    

}

