import { EventLogger } from "gd-eventlog";
import { BleInterfaceClass,BleDeviceClass,BlePeripheral,BleDeviceProps,ConnectProps,uuid } from "./ble";

interface ConnectState  {
    isConnecting: boolean;
    isConnected: boolean;
    isDisconnecting: boolean;
}


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
    connectState: ConnectState = {  isConnecting: false, isConnected: false, isDisconnecting: false }
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
            console.log( event)
        }
    }

    

    setInterface(ble: BleInterfaceClass): void { 
        this.ble = ble;
    }

    private cleanupListeners():void { 
        if ( this.characteristics === undefined) {
            this.characteristics = []
        }
        else {
            this.characteristics.forEach( c => {
                c.removeAllListeners('data');
            })
            this.characteristics = []
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


    async connect(props?: ConnectProps): Promise<boolean> {

        const connectPeripheral= async (peripheral: BlePeripheral)  => {
            this.connectState.isConnecting = true;

            const connected = this.ble.findConnected(peripheral);
            if (!connected) {
                try {
                    await  peripheral.connectAsync();
                }
                catch (err) {
                    this.logEvent({message:'cannot connect', error: err.message||err })
                    
                }    
            }
            this.connectState.isConnecting = false;
            this.connectState.isConnected = true;
            
            this.state = "connected"
            this.emit('connected')
            this.cleanupListeners();

            this.ble.addConnectedDevice(this)
            this.peripheral.once('disconnect', ()=> {this.onDisconnect()})   


            try {
                if (!connected) {
                    const {characteristics} = await peripheral.discoverSomeServicesAndCharacteristicsAsync(this.services||[],[]);
                    this.characteristics = characteristics;
                }
                else {
                    this.characteristics = (connected as BleDevice).characteristics;
                }
                
                this.characteristics.forEach( c=> {
                    if (c.properties.find( p=> p==='notify')) {
                        
    
                        c.on('data', (data, _isNotification) => {
                            this.onData(uuid(c.uuid), data)
                        });
                        if (!connected) {
                            c.subscribe((err) => {
                                if (err) 
                                    this.logEvent({message:'cannot subscribe', error: err.message||err })

                            })
                        }
                    }
                })
        
            }
            catch (err) { 
                this.logEvent({message:'cannot connect', error: err.message||err })
            }
                        

        }

        try {
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
                if ( this.address || this.id || this.name) {
                    
                    this.connectState.isConnecting = true;
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
                        // TODO handle error
                    }
                    
    
                }
                this.logEvent({message:'connect result: failure',mode:'device', device:  { id, name, address}  })
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

