import EventEmitter from "events"
import { BleCharacteristic } from "../types"

export type Property = 'read'| 'write' | 'notify' | 'indicate'

export type Descriptor = {
    uuid: string
    value: string | Buffer
}

export type Characteristic = {
    uuid:string;
    properties: Property[];
    secure?: boolean;
    value: Buffer
    descriptors:Descriptor[];
}

export const RESULT_SUCCESS                  = 0x00;
export const RESULT_INVALID_OFFSET           = 0x07;
export const RESULT_ATTR_NOT_LONG            = 0x0b;
export const RESULT_INVALID_ATTRIBUTE_LENGTH = 0x0d;
export const RESULT_UNLIKELY_ERROR           = 0x0e;


export class MockCharacteristic extends EventEmitter implements BleCharacteristic {
    uuid: string
    properties: string[]
    subscribe(callback: (err: Error | undefined) => void): void {
        throw new Error("Method not implemented.")
    }
    read(callback: (err: Error | undefined, data: Buffer) => void): void {
        throw new Error("Method not implemented.")
    }
    write(data: Buffer, withoutResponse: boolean, callback?: ((err: Error | undefined) => void) | undefined): void {
        throw new Error("Method not implemented.")
    }
    
}

export class StaticReadCharacteristic extends MockCharacteristic {
    uuid: string
    properties: Property[]
    secure?: boolean | undefined
    value: Buffer
    descriptors: Descriptor[]

    constructor( uuid:string, description:string, value) {
        super()
        this.uuid = uuid;
        this.properties = ['read']
        this.value = Buffer.isBuffer(value) ? value : Buffer.from(value)
        this.descriptors = [ {uuid:'2901', value:description}]
    }

    
    read( callback: (err:Error|undefined, data:Buffer)=>void): void {
        callback(undefined,this.value)
    }
    
}

export class StaticWriteCharacteristic extends MockCharacteristic {
    uuid: string
    properties: Property[]
    secure?: boolean | undefined
    value: Buffer
    descriptors: Descriptor[]
    size:number;

    constructor( uuid:string, description:string,size:number) {
        super()
        this.uuid = uuid;
        this.properties = ['write']
        this.value = Buffer.alloc(2)
        this.descriptors = [ {uuid:'2901', value:description}]
        this.size = size
    }

    write(data:Buffer, withoutResponse:boolean,callback?: (err?:Error)=>void): void{
        this.value = data;
        if (!withoutResponse && callback)
            callback()
    }
}


export type PrimaryService = {
    uuid: string;
    characteristics: Characteristic[]
}