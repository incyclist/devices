import { EventLogger } from "gd-eventlog";
import { BleInterfaceClass,BleDeviceClass,BlePeripheral,BleDeviceProps,ConnectProps,uuid } from "./ble";

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

    constructor (props?: BleDeviceConstructProps) {
        super()

        this.id = props.id;
        this.address =props.address;
        this.name = props.name;
        this.services = props.services;
        this.ble = props.ble;
        this.characteristics = []

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
            //this.characteristics = []
        }    
    }

    private onDisconnect() { 
        this.state = "disconnected"
        
        // reconnect
        if ( !this.connectState.isDisconnecting) {
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

    async connect(props?: ConnectProps): Promise<boolean> {

        const connectPeripheral= async (peripheral: BlePeripheral)  => {
            this.connectState.isConnecting = true;

            const connected = this.ble.findConnected(peripheral);
            if (!connected && peripheral.state!=='connected') {
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

                this.connectState.isConnecting = false;
                this.connectState.isConnected = true;
                
                this.state = "connected"
                this.emit('connected')
    
                this.ble.addConnectedDevice(this)
                this.peripheral.once('disconnect', ()=> {this.onDisconnect()})   
    
                
                this.characteristics.forEach( c=> {
                    
                    if (c.properties.find( p=> p==='notify')) {
                        
    
                        c.on('data', (data, _isNotification) => {
                            this.onData(uuid(c.uuid), data)
                        });

                        if (!connected) {
                            this.logEvent({message:'subscribe', device:this.name,address:this.address, service: c._serviceUuid, characteristic:c.uuid})
                            c.subscribe((err) => {
                                if (err) 
                                    this.logEvent({message:'cannot subscribe', device:this.name,address:this.address, service: c._serviceUuid, characteristic:c.uuid, error: err.message||err })

                            })
                        }
                    }
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

                this.characteristics.forEach( c=> {
                    if (c.properties.find( p=> p==='notify')) {
                        c.on('data', (data, _isNotification) => {
                            this.onData(uuid(c.uuid), data)
                        });
                    }
                })

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
        
                        const devices = await this.ble.scan({device:this});
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
    abstract write( characteristic:string, data:Buffer): Promise<boolean>
    abstract read( characteristic:string): Promise<Buffer>

    // emits 'data' => (data: any)

}

