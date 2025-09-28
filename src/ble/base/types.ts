import { DeviceSettings } from "../../types";
import { BleProtocol, IBleInterface } from "../types";

export interface BleDeviceData {}

export interface IInterfaceFactory {
    getInterface(): IBleInterface<any>
}

export class InterfaceFactory implements IInterfaceFactory {
    getInterface(): IBleInterface<any> {
        throw new Error('Not implemented')
    }
}

export interface BleDeviceSettings extends DeviceSettings {
    id?: string;
    protocol?: BleProtocol;
    address?: string;
}