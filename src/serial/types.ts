import { EventLogger } from "gd-eventlog"
import { BindingInterface } from "@serialport/bindings-interface"
import { SerialPortStream } from "@serialport/stream"

import { DeviceSettings, IncyclistScanProps, InterfaceProps } from "../types/index.js"
import SerialInterface from "./base/serial-interface.js"


export type SerialCommProps = {
    serial: SerialInterface,
    path: string,
    logger?: EventLogger
}
export type InterfaceBinding = {
    name: string;
    binding: BindingInterface;
};

export type InterfaceImplementation = {
    name: string;
    Serialport: any;
    implementation?: any;
};

export type SerialPortProps = {
    interface: string;
    port?: string;

};

export enum SerialInterfaceType  {
    SERIAL= 'serial',
    TCPIP= 'tcpip'
};

export interface SerialInterfaceProps extends InterfaceProps {
    ifaceName: string;
    binding?: BindingInterface;
}

export type PortMapping = {
    path: string;
    port: SerialPortStream;
};

export interface SerialScannerProps extends IncyclistScanProps {
    port?: string;
    protocol: string;
}

export interface SerialDeviceSettings extends DeviceSettings {
    protocol: string;
    host?: string;
    port?: string;
    interface: string | SerialInterface;
}

