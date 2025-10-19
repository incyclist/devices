import { EventEmitter } from "stream";
import { BleProperty } from "../../../../../lib/ble/types";
import { Descriptor, ICharacteristic, ICharacteristicDefinition, IEmulator } from "../types";

export class Characteristic<T> implements ICharacteristic<T>{

    public uuid: string 
    public properties: BleProperty[]
    public value: string|Buffer
    public descriptors: Descriptor[];

    protected data: T
    protected description: string
    protected emitter = new EventEmitter()
    protected emulator: IEmulator


    constructor( props:ICharacteristicDefinition) {
        this.uuid = props.uuid;
        this.properties = props.properties
        this.value = props.value
        this.descriptors = props.descriptors
    }

    setEmulator(emulator: IEmulator) {
        this.emulator = emulator
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

    send(buffer:Buffer):void {
        this.value = buffer
        this.notify()
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

