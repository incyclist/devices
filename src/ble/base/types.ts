import { IBleInterface } from "../types";

export interface BleDeviceData {}

export interface IInterfaceFactory {
    getInterface(): IBleInterface<any>
}

export class InterfaceFactory implements IInterfaceFactory {
    getInterface(): IBleInterface<any> {
        throw new Error('Not implemented')
    }
}