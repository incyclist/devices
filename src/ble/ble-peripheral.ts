import { BleCharacteristic, BlePeripheral,uuid } from "./ble";
import BleInterface from "./ble-interface";
import { EventLogger } from "gd-eventlog";
import EventEmitter from "events";

export type ConnectorState = {
    isConnected: boolean;
    isConnecting: boolean;
    isInitialized: boolean;
    isInitializing: boolean;
    isSubscribing: boolean;
    subscribed?: string[];
}

export default class BlePeripheralConnector {

    private state: ConnectorState;
    private services: string [];
    private characteristics: BleCharacteristic [];
    private ble: BleInterface
    private peripheral: BlePeripheral
    private logger?: EventLogger;
    private emitter: EventEmitter;

    constructor( ble: BleInterface,  peripheral: BlePeripheral) {
        this.ble = ble;
        this.peripheral = peripheral;
        this.emitter = new EventEmitter();

        if (!this.peripheral || !this.ble)
            throw new Error('Illegal Arguments')

        this.state = { isConnected:false, isConnecting:false, isInitialized:false, isInitializing:false, isSubscribing:false}
        this.services = undefined;
        this.characteristics = undefined;
        this.logger = new EventLogger( 'BLE')
    }

    logEvent(event) {
        if ( this.logger) {
            this.logger.logEvent(event)
        }
        if (process.env.BLE_DEBUG) {
            console.log( '~~~BLE:', event)
        }
    }  


    async connect() {
        if ( this.state.isConnected)
            return;

        this.logEvent( {message:'connect',peripheral:this.peripheral.address, state:this.state})

        this.state.isConnecting = true;
        try {
            if ( !this.state.isConnected || (this.peripheral && this.peripheral.state!=='connected')) {
                await this.peripheral.connectAsync();                    
                this.peripheral.once('disconnect', this.onDisconnect.bind(this))
            }
            this.state.isConnected = this.peripheral.state==='connected'
    
        }
        catch (err) {            
            this.logEvent( {message:'Error', fn:'connect()', error: err.message})
        }
        this.state.isConnecting = false;
    }

    async reconnect() {
        this.connect()
    }

    onDisconnect() {
        this.logEvent( {message:'onDisconnected',peripheral:this.peripheral.address, state:this.state})
        this.state.isConnected = false;

        this.reconnect();
    }

    // get all services and characteristics
    async initialize( enforce=false) {
        if (this.state.isInitialized && !enforce)
            return;

        this.logEvent( {message:'initialize',peripheral:this.peripheral.address, state:this.state, enforce})

        if ( this.state.isInitialized && enforce) {
            this.state.isInitialized = false;
        }

        this.state.isInitializing = true;
        this.characteristics = undefined;
        this.services = undefined;

        try {
            const res = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync([],[])    
            this.characteristics = res.characteristics
            this.services = res.services                
    
        }

        catch(err) {

        }
        this.state.isInitializing = false;
        this.state.isInitialized = this.characteristics!==undefined && this.services!==undefined
    }


    async subscribeAll( callback:(characteristicUuid:string, data)=>void): Promise<string[]> {

        // note: 
        // we try to keep the subscriptions open even when the device disconnects, 
        // This improves the performance of subsequent launched
        //
        // however the device might re-subscribe. Therefore we need to distinguish between subscribed characteristics (on the peripheral)
        // and the subscriptions (event handlers) of th device(s)
        const cnt = this.characteristics.length
        this.state.isSubscribing = true;
        
        
        const subscribed = []
        if (!this.state.subscribed)
            this.state.subscribed=[];

        for (let i=0;i<cnt;i++) {

            try {
                const c = this.characteristics[i]
                const isNotify = c.properties.find( p=> p==='notify');
                if (isNotify && subscribed.find(uuid=> uuid===c.uuid)===undefined ) {

                    // register 
                    c.on('data', (data, _isNotification) => {
                        this.onData(uuid(c.uuid), data)
                    });
                    if (callback)
                        this.on(uuid(c.uuid), callback)


                    this.logEvent({message:'subscribe', peripheral:this.peripheral.address, characteristic:c.uuid})

                    // don't resubscribe 
                    if ( this.state.subscribed.find( uuid => uuid===c.uuid)===undefined) {
                        try {
                            await this.subscribe(c.uuid)
                            subscribed.push(c.uuid)
                            this.state.subscribed.push(c.uuid)
                        }
                        catch (err) {
                            this.logEvent({message:'cannot subscribe', peripheral:this.peripheral.address, characteristic:c.uuid, error: err.message||err })
                        }
    
                    }
                }

            }
            catch(err) {
                console.log('~~~ error',err)
            }
        }

        this.state.isSubscribing = false;
        this.state.subscribed = subscribed;
        return subscribed;
    }

    subscribe( characteristicUuid:string): Promise<boolean> {
        return new Promise ( (resolve,reject) => {
            const characteristic: BleCharacteristic = this.characteristics.find( c=> c.uuid===characteristicUuid || uuid(c.uuid)===characteristicUuid );
            if (!characteristic) {
                reject(new Error( 'Characteristic not found'))
                return;
            }

            characteristic.on('data', (data, _isNotification) => {
                this.onData(characteristicUuid, data)
            });

            characteristic.subscribe((err) => {
                if (err)
                    reject(err)
                else 
                    resolve(true)
            })
    
        })
    } 

    onData( characteristicUuid:string, data) {
        this.emitter.emit(characteristicUuid, characteristicUuid,data)
    }

    on( characteristicUuid:string, callback:(characteristicUuid:string, data)=>void)  {
        if (callback)
            this.emitter.on(characteristicUuid,callback)
    } 

    off( characteristicUuid:string, callback:(characteristicUuid:string, data)=>void)  {
        if (callback)
            this.emitter.off(characteristicUuid,callback)
    } 

    removeAllListeners(characteristicUuid:string) {
        this.emitter.removeAllListeners(characteristicUuid)
    }


    getState() {
        return this.peripheral.state;
    }

    getCharachteristics() {
        return this.characteristics
    }

    getServices() {
        return this.services
    }




}