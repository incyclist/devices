import EventEmitter from 'events';
import {BleBinding, BleState} from '../ble'


export class BleLinuxBinding extends EventEmitter implements BleBinding{ 
    static _instance

    _state:BleState

    constructor() { 
        super(); 
        this._state = BleState.UNKNOWN

    }

    startScanning(serviceUUIDs?: string[] | undefined, allowDuplicates?: boolean | undefined, callback?: ((error?: Error | undefined) => void) | undefined): void {
        throw new Error('Method not implemented.');
    }
    stopScanning(callback?: (() => void) | undefined): void {
        throw new Error('Method not implemented.');
    }
    _bindings: any;
    state: string;

    async connectDevice(peripheral) {}
    async disconnectDevice(peripheral, callback) {}
    async subscribe(peripheral,characteristic, callback) { }
    async unsubscribe(peripheral,characteristic, callback) {  }
    async read(peripheral,characteristic, callback) { }
    async write(peripheral,characteristic,data,withoutResponse, callback) { }
    async getServices(peripheral,services, characteristics) { }


    static getInstance() {
        if (!BleLinuxBinding._instance) {
            BleLinuxBinding._instance = new BleLinuxBinding();
        }
        return BleLinuxBinding._instance;
    }
   

}

const Binding = BleLinuxBinding.getInstance()

export default Binding
