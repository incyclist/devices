import { EventEmitter } from "stream";
import { BleProperty } from "incyclist-devices"
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
    protected notifyCallback?: (buffer: Buffer) => void

    constructor( props:ICharacteristicDefinition) {
        this.uuid = props.uuid;
        this.properties = props.properties
        this.value = props.value
        this.descriptors = props.descriptors
        // NOTE: @stoprocent/bleno's Characteristic constructor wires its internal EventEmitter
        // listeners (this.on('subscribe', this.onSubscribe.bind(this)), etc.) at construction
        // time, binding whatever onSubscribe/onWriteRequest/onReadRequest/onUnsubscribe were
        // passed in the constructor options. Assigning `this.bleno.onSubscribe = ...` *after*
        // construction (as this used to do) has no effect - the listener is already bound to
        // the library's no-op default, so subscribes/writes/reads silently never reach us even
        // though the client sees a successful ATT-level ack. Must pass these in the options.
        this.bleno = new bleno.Characteristic( {
            uuid:this.uuid,
            properties: this.properties,
            value:  this.value ? Buffer.from(this.value) : null,
            descriptors: this.getDescriptors(this.descriptors),

            onReadRequest: (_connection, _offset, callback) => {
                callback( bleno.Characteristic.RESULT_SUCCESS, Buffer.from(this.value))
            },

            onWriteRequest: (_connection, data, offset, withoutResponse, callback) => {
                this.write(data, offset, withoutResponse, (success:boolean) => {
                    callback( success ? bleno.Characteristic.RESULT_SUCCESS : bleno.Characteristic.RESULT_UNLIKELY_ERROR)
                })
            },

            onSubscribe: (_connection, _maxValueSize, updateValueCallback) => {
                this.subscribe(updateValueCallback)
            },

            onUnsubscribe: () => {
                // must pass the SAME callback reference subscribe() registered - EventEmitter.off()
                // only removes a listener on exact function identity. Passing a fresh anonymous
                // function here (as this used to do) silently fails to remove it, leaving the
                // stale callback (tied to the now-dead connection) in place; the next notify()
                // tick then invokes it and crashes inside bleno's own gatt.js, which can no longer
                // find that connection.
                if (this.notifyCallback) {
                    this.unsubscribe(this.notifyCallback)
                    delete this.notifyCallback
                }
            }
        })

    }

    subscribe(callback: (buffer: Buffer) => void): void {

        this.notifyCallback = callback
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

