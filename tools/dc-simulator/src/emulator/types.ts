import { BleProperty } from "../../../../lib/ble/types"

export interface Descriptor  {
    uuid: string,
    value: string | Buffer
}

export interface ICharacteristicDefinition  {
    uuid: string,
    properties: BleProperty[],
    value: string|Buffer
    descriptors: Descriptor[]

}



export interface TValue  { 
    ts?: number
}


export interface ICharacteristic<T extends TValue>  extends ICharacteristicDefinition {

    subscribe(callback: (buffer: Buffer) => void): void
    unsubscribe(callback: (buffer: Buffer) => void): void
    update(value:T): void
    notify(): void
    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (success: boolean, response?: Buffer) => void): void 
}

export interface IServiceDefinition  {
    uuid: string,
    characteristics: ICharacteristic<TValue>[]
}

export interface IService  {
    notify(): void
}
