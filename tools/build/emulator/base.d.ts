import { EventEmitter } from "stream";
import { BleProperty } from "../../../lib/ble/types";
import { Descriptor, ICharacteristic, ICharacteristicDefinition, IService, IServiceDefinition, TValue } from "./types";
export declare class Characteristic<T> implements ICharacteristic<T> {
    uuid: string;
    properties: BleProperty[];
    value: string | Buffer;
    descriptors: Descriptor[];
    protected data: T;
    protected description: string;
    protected emitter: EventEmitter<[never]>;
    constructor(props: ICharacteristicDefinition);
    subscribe(callback: (buffer: Buffer) => void): void;
    unsubscribe(callback: (buffer: Buffer) => void): void;
    update(value: T): void;
    notify(): void;
    valueStr(): string;
    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (success: boolean) => void): void;
}
export declare class Service implements IService {
    uuid: string;
    characteristics: ICharacteristic<TValue>[];
    protected iv: NodeJS.Timeout;
    constructor(props: IServiceDefinition);
    notify(): void;
    start(frequency: number): void;
    stop(): void;
}
