import { EventEmitter } from "stream";
import { BleProperty } from "../../../lib/ble/types";
import { Descriptor, ICharacteristic, ICharacteristicDefinition, IService, IServiceDefinition, TValue } from "./types";

export class Characteristic<T> implements ICharacteristic<T>{

    public uuid: string 
    public properties: BleProperty[]
    public value: string|Buffer
    public descriptors: Descriptor[];

    protected data: T
    protected description: string
    protected emitter = new EventEmitter()



    constructor( props:ICharacteristicDefinition) {
        this.uuid = props.uuid;
        this.properties = props.properties
        this.value = props.value
        this.descriptors = props.descriptors
    }

    subscribe(callback: (buffer: Buffer) => void): void {
        
        this.emitter.on('notification', callback)
        console.log('subscribe',this.description, this.emitter.listenerCount('notification'),   callback)

    }

    unsubscribe(callback: (buffer: Buffer) => void): void {
        
        this.emitter.off('notification', callback)
        console.log('unsubscribe',this.description, this.emitter.listenerCount('notification'),   callback)
    }

    update(value:T): void {
        this.data = value

    }

    notify():void {

        
        if (!this.value)  {
            return
        }

        this.emitter.emit('notification', this.value)

        if (process.env.NOTIFY_DEBUG)
        console.log(`${this.description} ${this.valueStr()} Msg:${this.value.toString('hex')}`);

        
    }

    valueStr() {
        if (!this.data)
            return ''
        const keys = Object.keys(this.data).filter( k => this.data[k]!==undefined && this.data[k]!==null)
        const values = Object.values(this.data) 
        return keys.map( (key,i) => `${key}:${values[i]}`).join(',')
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (success: boolean) => void): void {
        throw new Error('Method not implemented.');
    }
        

}

export class Service implements IService {
    public uuid: string
    public characteristics: ICharacteristic<TValue>[] =[]
    protected iv: NodeJS.Timeout

    constructor(props:IServiceDefinition) {
        this.uuid = props.uuid
        this.characteristics = props.characteristics


    }

    notify(): void {
        this.characteristics.forEach( c => c.notify())
    }

    start(frequency: number): void {    
        this.iv = setInterval(() => {
        
            this.notify()
        }, frequency)
    }

    stop() {
        if (this.iv) {  
            clearInterval(this.iv)
            delete this.iv
        }
    }

}