/// <reference types="node" />
import { DeviceProtocol } from "../DeviceProtocol";
import { EventLogger } from "gd-eventlog";
import { Command } from "../types/command";
import EventEmitter from "events";
export declare type SerialCommsProps = {
    logger?: EventLogger;
    protocol: DeviceProtocol;
    port: string;
    settings?: any;
};
declare enum SerialCommsState {
    Idle = 0,
    Connecting = 1,
    Connected = 2,
    Disconnecting = 3,
    Disconnected = 4,
    Error = 5
}
export default class KettlerSerialComms<T extends Command> extends EventEmitter {
    private logger;
    private port;
    private sp;
    private queue;
    private state;
    private settings;
    private worker;
    private sendState;
    private currentCmd;
    private protocol;
    constructor(opts: SerialCommsProps);
    getPort(): string;
    setPort(port: any): void;
    isConnected(): boolean;
    stateIn: (allowedStates: SerialCommsState[]) => boolean;
    onPortOpen(): void;
    onPortClose(): Promise<void>;
    onPortError(err: any): void;
    open(): void;
    close(): void;
    startWorker(): void;
    stopWorker(): void;
    onData(data: string | Buffer): void;
    write(cmd: Command): void;
    sendNextCommand(): Command | undefined;
    send(cmd: Command): void;
}
export {};
