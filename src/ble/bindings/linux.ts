import EventEmitter from 'events';
import { BleBinding, BleInterfaceState } from '../types';


export class BleLinuxBinding extends EventEmitter implements BleBinding{ 
    static _instance
    _bindings: any;
    state: BleInterfaceState

    constructor() { 
        super(); 
        this.state = 'unknown'
        this._bindings = this;

    }
    static getInstance() {
        if (!BleLinuxBinding._instance) {
            BleLinuxBinding._instance = new BleLinuxBinding();
        }
        return BleLinuxBinding._instance;
    }


    startScanning(serviceUUIDs?: string[] | undefined, allowDuplicates?: boolean | undefined, callback?: ((error?: Error | undefined) => void) | undefined): void {
        throw new Error('Method not implemented.');
    }
    stopScanning(callback?: (() => void) | undefined): void {
        throw new Error('Method not implemented.');
    }

    // implement "lacy initializing", i.e. init upon first listener being added
    on(eventName: string | symbol, listener: (...args: any[]) => void):this {
        super.addListener(eventName,listener)    
        if (eventName==='stateChange') {         
            setTimeout( ()=>{
                this.state = 'poweredOn'
                this.emit( 'stateChange',this.state)
            },100)   
            
        }
        return this;
    }    

}

const Binding = BleLinuxBinding.getInstance()

export default Binding
