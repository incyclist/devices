import { EventLogger } from "gd-eventlog";
import { BleInterfaceClass,BleDeviceClass,BlePeripheral,BleDeviceProps,ConnectProps,uuid, BleCharacteristic, BleDeviceInfo } from "./ble";

const CONNECT_WAIT_TIMEOUT = 10000;

interface BleDeviceConstructProps extends BleDeviceProps {
    log?: boolean;
    logger?: EventLogger
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
    isSubscribed: boolean;

    constructor (props?: BleDeviceConstructProps) {
        super()

        this.id = props.id;
        this.address =props.address;
        this.name = props.name;
        this.services = props.services;
        this.ble = props.ble;
        this.characteristics = []
        this.isSubscribed = false;

        if (props.peripheral) {
            const {id,address,advertisement,state } = props.peripheral;
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

    private cleanupListeners():void { 
        //console.log('~~cleanup', this.characteristics)
        if ( this.characteristics === undefined) {
            this.characteristics = []
        }
        else {
            this.characteristics.forEach( c => {
                c.unsubscribe();
                c.removeAllListeners('data');
            })
            this.isSubscribed = false;
            //this.characteristics = []
        }    
    }

    private onDisconnect() { 
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
        return this.getDeviceInfo().then( ()=>true)    
    }

    async connect(props?: ConnectProps): Promise<boolean> {

        const connectPeripheral= async (peripheral: BlePeripheral)  => {
            this.connectState.isConnecting = true;

            const connected = this.ble.findConnected(peripheral);
            if (peripheral.state!=='connected') {
                this.isSubscribed = false;
                try {
                    await  peripheral.connectAsync();
                }
                catch (err) {
                    this.logEvent({message:'cannot connect', error: err.message||err })
                    
                }    
            }

            try {
                //this.cleanupListeners();
                if (!this.characteristics)
                    this.characteristics = [];
                if (!connected ) {
                    if (!this.characteristics || this.characteristics.length===0) {
                        this.logEvent({message:'connect: discover characteristics start'})
                        const res = await peripheral.discoverSomeServicesAndCharacteristicsAsync([],[]);
                        const {characteristics} = res
                        this.logEvent({message:'connect: discover characteristics result', 
                            result: characteristics.map(c =>({ uuid:uuid(c.uuid), properties:c.properties.join(','), service:uuid(c._serviceUuid) }) )
                        })
    
                        this.characteristics = characteristics;    
                    }
                    else {
                        //console.log('~~~ using cached characteristics')
                    }
                }
                
                else {
                    this.characteristics = (connected as BleDevice).characteristics;
                }

    
                let device;
                if (!connected) {
                    this.ble.addConnectedDevice(this)
                    device = this;
                }
                else {
                    device = connected;
                }

                this.peripheral.once('disconnect', ()=> {this.onDisconnect()})   
                await this.subscribeAll(device);
                this.connectState.isConnecting = false;
                this.connectState.isConnected = true;
                
                this.state = "connected"
                this.emit('connected')

                this.init().then( (isInitialized:boolean ) => {
                    if (isInitialized)
                        this.emit('deviceInfo',this.deviceInfo)
                })

        
            }
            catch (err) { 
                this.logEvent({message:'cannot connect', error: err.message||err })
                this.connectState.isConnecting = false;
                this.connectState.isConnected = false;
            }
                        

        }


        try {
            if (this.connectState.isConnecting) {
                await this.waitForConnectFinished(CONNECT_WAIT_TIMEOUT)
            }
    
            if ( this.connectState.isConnected) {

                if ( !this.isSubscribed) {
                    await this.subscribeAll();
    
                }

                return true;
            }
            this.connectState.isConnecting = true;
    
    
            if ( this.peripheral) {
                const {id,address,advertisement } = this.peripheral;
                const name = advertisement?.localName;
                this.logEvent({message:'connect requested',mode:'peripheral', device: { id, name, address:address} })
                await connectPeripheral(this.peripheral)
                this.logEvent({message:'connect result: success',mode:'peripheral', device: { id, name, address} })
                return true;            
            }
            else {
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
                            await connectPeripheral(this.peripheral)
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
    abstract onData(characteristic:string, data: Buffer): void;

    async subscribeAll(device=this) {
        if (this.isSubscribed)
            return;

        const cnt = this.characteristics.length
        for (let i=0;i<cnt;i++) {

            try {
                const c = this.characteristics[i]
                const isNotify = c.properties.find( p=> p==='notify');
                if (isNotify) {
                    c.on('data', (data, _isNotification) => {
                        this.onData(uuid(c.uuid), data)
                    });

                    if (!device.isSubscribed) {
                        this.logEvent({message:'subscribe', device:this.name,address:this.address, service: c._serviceUuid, characteristic:c.uuid})
                        try {
                            await this.subscribe(c.uuid)
                        }
                        catch (err) {
                            this.logEvent({message:'cannot subscribe', device:this.name,address:this.address, service: c._serviceUuid, characteristic:c.uuid, error: err.message||err })
                        }
                    }
                }

            }
            catch(err) {
                console.log('~~~ error',err)
            }
        }

        this.isSubscribed = true;

    }

    subscribe( characteristicUuid:string): Promise<boolean> {
        return new Promise ( (resolve,reject) => {
            const characteristic: BleCharacteristic = this.characteristics.find( c=> c.uuid===characteristicUuid || uuid(c.uuid)===characteristicUuid );
            if (!characteristic) {
                reject(new Error( 'Characteristic not found'))
                return;
            }
            characteristic.subscribe((err) => {
                if (err)
                    reject(err)
                else 
                    resolve(true)
            })
    
        })

    } 

    write( characteristicUuid:string, data:Buffer, withoutResponse:boolean): Promise<boolean> {
        return new Promise ( (resolve,reject) => {
            const characteristic: BleCharacteristic = this.characteristics.find( c=> c.uuid===characteristicUuid || uuid(c.uuid)===characteristicUuid );
            if (!characteristic) {
                reject(new Error( 'Characteristic not found'))
                return;
            }
            characteristic.write(data,withoutResponse, (err) => {
                if (err)
                    reject(err)
                else 
                    resolve(true)
            })
    
        })

    }

    read( characteristicUuid:string): Promise<Buffer> {
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
                return b ? b.toString() : undefined;
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

