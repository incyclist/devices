import { BleCharacteristic, BlePeripheral, IBlePeripheralConnector } from './types';
import BleInterface from "./ble-interface";
import { EventLogger } from "gd-eventlog";
import EventEmitter from "events";
import { uuid } from "./utils";

export type ConnectorState = {
    isConnected: boolean;
    isConnecting: boolean;
    isInitialized: boolean;
    isInitializing: boolean;
    isSubscribing: boolean;
    subscribed?: string[];
    connectPromise?: Promise<void>
}



export default class BlePeripheralConnector implements IBlePeripheralConnector{

    private state: ConnectorState;
    private services: string [];
    private characteristics: BleCharacteristic [];
    private ble: BleInterface
    private peripheral: BlePeripheral
    private logger?: EventLogger;
    private emitter: EventEmitter;

    constructor( peripheral: BlePeripheral) {
        this.ble = BleInterface.getInstance();
        this.peripheral = peripheral;
        this.emitter = new EventEmitter();

        if (!this.peripheral || !this.ble)
            throw new Error('Illegal Arguments')

        this.state = { subscribed:[], isConnected:false, isConnecting:false, isInitialized:false, isInitializing:false, isSubscribing:false}
        this.services = [];
        this.characteristics = [];
        this.logger = new EventLogger( 'BLE')
    }

    logEvent(event) {
        if ( this.logger) {
            this.logger.logEvent(event)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
    
        if (w?.DEVICE_DEBUG||process.env.BLE_DEBUG) {
            console.log( '~~~ BLE', event)
        }
    }  

    async connect():Promise<void> {
        if ( this.state.isConnected)
            return;

        this.logEvent( {message:'connect peripheral',peripheral:this.peripheral.address, state:this.state, peripheralState:this.peripheral.state})

        const wasConnecting = this.state.isConnecting

        this.state.isConnecting = true;
        try {
            if (!wasConnecting) {
                this.peripheral.once('disconnect', ()=> {this.onDisconnect()})

                if ( !this.state.isConnected || (this.peripheral && this.peripheral.state!=='connected')) {
                    this.state.connectPromise = this.peripheral.connectAsync();                    
                }
            }

            if (this.state.connectPromise)
                await this.state.connectPromise

            this.state.isConnected = this.peripheral.state==='connected'
            this.state.connectPromise = undefined;
            //this.peripheral.removeAllListeners('disconnect')
            return;
    
        }
        catch (err) {            
            this.logEvent( {message:'Error', fn:'connect()', error: err.message})
        }
        this.state.connectPromise = undefined;
        this.state.isConnecting = false;
    }

    async reconnect():Promise<void>  {
        await this.connect()
    }

    onDisconnect() {
        this.peripheral.removeAllListeners('connect');
        this.peripheral.removeAllListeners('disconnect');
        this.logEvent( {message:'onDisconnected',peripheral:this.peripheral.address, state:this.state})

        this.state.isConnected = false;
        this.state.isConnecting = false;
        this.state.isInitialized = false;
        this.state.isInitializing = false;
        this.state.connectPromise = undefined
        this.state.isSubscribing = false;
        this.state.subscribed = []
        this.emitter.emit('disconnect')
        //this.reconnect();
    }

    // get all services and characteristics
    async initialize( enforce=false):Promise<boolean> {

        this.logEvent( {message:'initialize',peripheral:this.peripheral.address, state:this.state, enforce})

        if (this.state.isInitialized && !enforce)
            return true;

        if ( this.state.isInitialized && enforce) {
            this.state.isInitialized = false;
        }

        return new Promise( async done => {
            this.state.isInitializing = true;
            this.characteristics = [];
            this.services = [];
    
            try {
                this.emitter.once('disconnect',()=>{
                    done(false)
                })
    
                const res = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync([],[])    
    
    
                // we might have received a disconnect while sending the previous request
                if (this.state.isInitializing) {
                    this.characteristics = res.characteristics || []
                    const services = res.services || [] 
                    this.services = services.map( s => typeof (s) === 'string' ? s : s.uuid)
                    this.state.isInitializing = false;
                    this.state.isInitialized = this.characteristics!==undefined && this.services!==undefined && this.characteristics.length>0 && this.services.length>0
                    this.logEvent( {message:'initialize done',peripheral:this.peripheral.address, state:this.state})
                    return done(true)
                }
                else {
                    this.logEvent( {message:'initialize interrupted',peripheral:this.peripheral.address})
                
                }
                
            }
    
            catch(err) {
                this.logEvent({message:'error', fn:'initialize', error:err.message, stack:err.stack})
                this.state.isInitializing = false;
                this.state.isInitialized = false
                done(false)
            }
    
        })

    }

    isSubscribed( characteristicUuid:string):boolean {
        return this.state.subscribed?.find( c=> c===characteristicUuid || uuid(c)===characteristicUuid || c===uuid(characteristicUuid) )!==undefined
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
                    if (callback) {
                        this.on(uuid(c.uuid), callback)
                    }


                    this.logEvent({message:'subscribe', peripheral:this.peripheral.address, characteristic:c.uuid,uuid:uuid(c.uuid)})

                    // don't resubscribe 
                    if ( this.state.subscribed?.find( uuid => uuid===c.uuid)===undefined) {
                        try {
                            await this.subscribe(c.uuid,3000)
                            subscribed.push(c.uuid)
                        }
                        catch (err) {
                            this.logEvent({message:'cannot subscribe', peripheral:this.peripheral.address, characteristic:c.uuid, error: err.message||err })
                        }
    
                    }
                }

            }
            catch(err) {
                this.logEvent({message:'error', fn:'subscribeAll()',error:err.message||err, stack:err.stack})
            }
        }

        this.state.isSubscribing = false;
        this.state.subscribed = subscribed;
        return subscribed;
    }

  

    subscribe( characteristicUuid:string, timeout?:number): Promise<boolean> {
        
        this.logEvent({message:'subscribe attempt',characteristic:characteristicUuid,characteristics: this.characteristics.map(c=>({characteristic:c.uuid,uuid:uuid(c.uuid)}))})
        return new Promise ( (resolve,reject) => {
    
            try {
                const characteristic: BleCharacteristic = this.characteristics.find( c=> uuid(c.uuid)===uuid(characteristicUuid) || uuid(c.uuid)===uuid(characteristicUuid) );

                if (!characteristic) {
                    reject(new Error( 'Characteristic not found'))
                    return;
                }
                this.logEvent({message:'subscribe', peripheral:this.peripheral.address, characteristic:characteristic.uuid})
    
                characteristic.removeAllListeners('data');
                characteristic.on('data', (data, _isNotification) => {
                    this.onData(uuid(characteristicUuid), data)
                });

                let to;
                if (timeout) {
                    to = setTimeout( ()=>{ 
                        this.logEvent({message:'subscribe result',characteristic:characteristicUuid,error:'timeout'})
                        reject( new Error('timeout'));
                    },timeout)
                }
    
                characteristic.subscribe((err) => {
                    if (to) clearTimeout(to)
                    this.logEvent({message:'subscribe result',characteristic:characteristicUuid, error:err})
                    
                    if (err)
                        reject(err)
                    else {
                        this.state.subscribed.push(characteristicUuid)
                        resolve(true)
                    }
                })
        
    
            }
            catch(err) {
                this.logEvent({message:'error',error:err.message||err, stack:err.stack})
            }
        })
    } 

    unsubscribeAll() {
        this.characteristics?.forEach(c=> {
            const isNotify = c.properties.find( p=> p==='notify');
            if (isNotify) {
                this.unubscribe(c)
                
                
            }
        })
        this.state.isSubscribing = false;
        this.state.subscribed=[];
    }

    unubscribe(c:BleCharacteristic) {
        c.unsubscribe(undefined)
        c.removeAllListeners()
    }

    onData( characteristicUuid:string, data):void {
        this.emitter.emit(uuid(characteristicUuid), characteristicUuid,data)
    }

    on( characteristicUuid:string, callback:(characteristicUuid:string, data)=>void):void  {
        if (callback)
            this.emitter.on(uuid(characteristicUuid),callback)
    } 

    once( characteristicUuid:string, callback:(characteristicUuid:string, data)=>void):void  {
        if (callback)
            this.emitter.once(uuid(characteristicUuid),callback)
    } 

    off( characteristicUuid:string, callback:(characteristicUuid:string, data)=>void):void  {
        if (callback)
            this.emitter.off(uuid(characteristicUuid),callback)
    } 

    removeAllListeners(characteristicUuid:string):void {
        this.emitter.removeAllListeners(uuid(characteristicUuid))
    }


    getState():string {
        return this.peripheral.state;
    }

    getCharachteristics():BleCharacteristic [] {
        return this.characteristics
    }

    getServices():string[] {
        return this.services
    }

    getPeripheral(): BlePeripheral {
        return this.peripheral;
    }




}