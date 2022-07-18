import { EventLogger } from "gd-eventlog";
import { BleInterfaceClass,BleDeviceClass,BlePeripheral,BleDeviceProps,ConnectProps,uuid, BleCharacteristic, BleDeviceInfo } from "./ble";
import BlePeripheralConnector from "./ble-peripheral";

const CONNECT_WAIT_TIMEOUT = 10000;

interface BleDeviceConstructProps extends BleDeviceProps {
    log?: boolean;
    logger?: EventLogger;
}

type CommandQueueItem = {
    uuid: string,
    data: Buffer,
    resolve, 
    reject,
    timeout
}

export abstract class BleDevice extends BleDeviceClass  { 

    id: string;
    address: string;
    name: string;
    services: string[];
    ble: BleInterfaceClass;
    peripheral?: BlePeripheral;
    characteristics = []
    state?: string;
    logger?: EventLogger;
    deviceInfo: BleDeviceInfo = {}
    isInitialized: boolean;
    subscribedCharacteristics: string[]
    writeQueue: CommandQueueItem[];

    constructor (props?: BleDeviceConstructProps) {
        super()

        this.id = props.id;
        this.address =props.address;
        this.name = props.name;
        this.services = props.services;
        this.ble = props.ble;
        this.characteristics = []
        this.subscribedCharacteristics = [];
        this.isInitialized = false;
        this.writeQueue = [];

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
        else if (props.log) {
            this.logger = new EventLogger('BleDevice');
        }

    }

    logEvent(event) {
        if ( this.logger) {
            this.logger.logEvent(event)
        }
        if (process.env.BLE_DEBUG) {
            console.log( '~~~BLE:', event)
        }
    }  

    setInterface(ble: BleInterfaceClass): void { 
        this.ble = ble;
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
            this.connectState.isConnected = false;
            this.connect( ) 
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

    init(): Promise<boolean> {
        if (this.isInitialized)
            return Promise.resolve(true);

        return this.getDeviceInfo().then( ()=> { 
            this.emit('deviceInfo',this.deviceInfo)

            this.logEvent({message:'ftms device init done',...this.deviceInfo})
            this.isInitialized = true;

            return true;
        })    
    }

    async connectPeripheral  (peripheral: BlePeripheral)   {

        this.connectState.isConnecting = true;


        try {
            const connector = this.ble.getConnector(peripheral)

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

    

    async subscribeAll(conn?: BlePeripheralConnector) {

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

        try {
            this.logEvent( {message:'connect',address: this.peripheral? this.peripheral.address: this.address, state:this.connectState})
            if (this.connectState.isConnecting) {
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
        
                        const devices = await this.ble.scan({requested:this});
                        if ( devices && devices.length > 0) {
                            this.peripheral = devices[0].peripheral;
                            await this.connectPeripheral(this.peripheral)
                            this.logEvent({message:'connect result: success',mode:'device', device:  { id, name, address}  })
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

        if (!this.connectState.isConnecting && !this.connectState.isConnected) {
            this.connectState.isDisconnecting = false;
            this.logEvent({message:'disconnect result: success',device: { id, name, address} })
            return true;
        }


        if (this.connectState.isConnecting) {
            // log warning
            this.cleanupListeners();
            // reconnect posible after 1s
            setTimeout(()=> { this.connectState.isDisconnecting = false; }, 1000)
            this.logEvent({message:'disconnect result: unclear - connect ongoing',device: { id, name, address} })
            return true;
        }

        if (this.connectState.isConnected) { 
            this.ble.removeConnectedDevice(this)
            this.cleanupListeners();

            // we keep the device connected, so that it can be re-used

            // reconnect posible after 1s
            setTimeout(()=> { this.connectState.isDisconnecting = false; }, 1000)
            this.logEvent({message:'disconnect result: success',device: { id, name, address} })
            return true;
        }
    }
   

    abstract getProfile(): string;

    onData(characteristic:string, data: Buffer): void {
        console.log( '~~~ data', characteristic, data)

        if (this.writeQueue.length>0 ) {
            const writeIdx = this.writeQueue.findIndex( i => i.uuid===characteristic.toLocaleLowerCase());            

            if (writeIdx!==-1) {
                const writeItem = this.writeQueue[writeIdx];

                this.writeQueue.splice(writeIdx,1);
                
                if (writeItem.resolve)
                    writeItem.resolve(data)
                

            }

        }

    }


    async write( characteristicUuid:string, data:Buffer, withoutResponse:boolean=false): Promise<ArrayBuffer> {

        if ( !withoutResponse && this.subscribedCharacteristics.find( c => c===characteristicUuid) === undefined) {
            const connector = this.ble.getConnector( this.peripheral)
            connector.on(characteristicUuid, (uuid,data)=>{ 
                this.onData(uuid,data)
            })

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
                characteristic.write(data,withoutResponse);
                resolve(new ArrayBuffer(0));
                return;
            }

            const writeId = this.writeQueue.length;
            this.writeQueue.push( {uuid:characteristicUuid.toLocaleLowerCase(), data, resolve, reject,timeout:Date.now()+1000})
            characteristic.write(data,withoutResponse, (err) => {
                if (err) {
                    this.writeQueue.splice(writeId,1)
                    reject(err)
                }                    
            })
    
        })

    }

    read( characteristicUuid:string): Promise<Uint8Array> {
        return new Promise ( (resolve,reject) => {
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

