import EventEmitter from 'events';
import { sleep } from '../../utils/utils';
import {BleBinding, BleState} from '../ble'
import { BlePeripheral } from '../types';
import { MockCharacteristic, PrimaryService } from './types';

export type BleMockPeripheral = {
    services: PrimaryService[]
    id: string;
    name: string;
    address: string
}

export class BleMockBinding extends EventEmitter { 
    static _instance
    init() {}
    static getInstance() {
        if (!BleMockBinding._instance) {
            BleMockBinding._instance = new BleMockBinding();
        }
        return BleMockBinding._instance;
    } 
}

type ChannelState = 'IDLE' | 'SCANNING'

class Binding extends EventEmitter implements BleBinding {
    _bindings = BleMockBinding.getInstance() 
    state = BleState.UNKNOWN
    channelState:ChannelState = 'IDLE'
    peripherals: BleMockPeripheral[] = []

    addMock(peripheral:BleMockPeripheral):void {
        this.peripherals.push(peripheral)
    }
    reset() {
        this.peripherals = []
        this.state = BleState.UNKNOWN
        this.channelState = 'IDLE'
    }

    on(eventName: string | symbol, listener: (...args: any[]) => void):this {
        super.addListener(eventName,listener)    
        if (eventName==='stateChange') {         
            setTimeout( ()=>{
                this.emit( 'stateChange',BleState.POWERED_ON)
            },100)   
            
        }
        return this;
    }

    async startScanning(serviceUUIDs?: string[] | undefined, allowDuplicates?: boolean | undefined, callback?: ((error?: Error | undefined) => void) | undefined): Promise<void> {
        this.channelState = 'SCANNING'
        if (callback)
            callback()

        await sleep(50)

        this.peripherals.forEach( p => {
            this.emit('discover',new MockPeripheral(p))
        })
        
    }
    stopScanning(callback?: (() => void) | undefined): void {
        this.channelState = 'IDLE'
        if (callback)
            callback()
    }

}

class MockPeripheral  extends EventEmitter implements BlePeripheral {
    id?: string | undefined;
    address?: string | undefined;
    name?: string | undefined;
    services;
    advertisement: any;
    state: string;

    constructor(p:BleMockPeripheral) {
        super();
        this.id = p.id;
        this.name = p.name;
        this.address = p.address
        this.advertisement = {
            localName: p.name,
            serviceUuids: p.services.map(s=>s.uuid)
        }
        this.services = p.services
    }

    async connectAsync(): Promise<void> {
    }

    async disconnect(cb: (err?: Error | undefined) => void): Promise<void> {
        this.removeAllListeners()
    }

    async discoverSomeServicesAndCharacteristicsAsync(serviceUUIDs: string[], characteristicUUIDs: string[]): Promise<any> {

        const characteristics: MockCharacteristic[] = []

        this.services.forEach( s=> {

            if (serviceUUIDs && serviceUUIDs.length>0 &&  !serviceUUIDs.includes(s.uuid))
                return;

            s.characteristics.forEach( c => {
                if (characteristicUUIDs && characteristicUUIDs.length>0 &&  !characteristicUUIDs.includes(c.uuid))
                    return;

                c._serviceUuid = s.uuid;
                c.name = c.descriptors?.find(d=>d.uuid==='2901')?.value;
                characteristics.push( c )    
            })
            
        })
        return {services:this.services,characteristics}        
    }

}


const mock = new Binding()

export default mock
