import { EventEmitter } from "stream";
import { BleProperty } from "../../../../../lib/ble/types";
import { Descriptor, ICharacteristic, ICharacteristicDefinition } from "../types";
import bleno from "@stoprocent/bleno";

export class Characteristic<T> implements ICharacteristic<T>{

    
    public uuid: string 
    public properties: BleProperty[]
    public value: string|Buffer
    public descriptors: Descriptor[];
    public bleno: InstanceType<typeof bleno.Characteristic>

    protected data: T
    protected description: string
    protected emitter = new EventEmitter()

    constructor( props:ICharacteristicDefinition) {
        this.uuid = props.uuid;
        this.properties = props.properties
        this.value = props.value
        this.descriptors = props.descriptors
        this.bleno = new bleno.Characteristic( {
            uuid:this.uuid,
            properties: this.properties,
            value:  this.value ? Buffer.from(this.value) : null,
            descriptors: this.getDescriptors(this.descriptors)

        })

        this.bleno.onReadRequest = (_offset,callback) => {
            callback( this.bleno.RESULT_SUCCESS, Buffer.from(this.value))
        }

        this.bleno.onWriteRequest = (data, offset, withoutResponse, callback)=> {
            this.write(data,offset,withoutResponse, (success:boolean)=> {
                callback( success ? this.bleno.RESULT_SUCCESS : this.bleno.RESULT_UNLIKELY_ERROR)
            })
        }

        this.bleno.onSubscribe = (_maxValueSize, updateValueCallback) => {
            this.subscribe(updateValueCallback)
        }

        this.bleno.onUnsubscribe = ()=>{
            this.unsubscribe( ()=>{ /* */})
        }
        
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


    protected getDescriptors( descriptors:Descriptor[] ):InstanceType<typeof bleno.Descriptor>[] {
        return descriptors.map(d=> {
            const bledescr = new bleno.Descriptor( {
                uuid: d.uuid,
                value: Buffer.from(d.value)
            })
            return bledescr
        })
    }


}

