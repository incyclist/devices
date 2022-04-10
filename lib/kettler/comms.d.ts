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
export declare enum SerialCommsState {
    Idle = 0,
    Connecting = 1,
    Connected = 2,
    Disconnecting = 3,
    Disconnected = 4,
    Error = 5
}
export declare enum SendState {
    Idle = 0,
    Sending = 1,
    Receiving = 2
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
    private currentTimeout;
    private protocol;
    constructor(opts: SerialCommsProps);
    getPort(): string;
    setPort(port: any): void;
    getLogger(): EventLogger;
    isConnected(): boolean;
    stateIn: (allowedStates: SerialCommsState[]) => boolean;
    _setState(state: SerialCommsState): void;
    _setSendState(state: SendState): void;
    _setCurrentCmd(cmd: T): void;
    stopCurrentTimeoutCheck(): void;
    onPortOpen(): void;
    onPortClose(): Promise<void>;
    onPortError(err: any): void;
    open(): void;
    close(): void;
    startWorker(): void;
    stopWorker(): void;
    clearTimeout(): void;
    onData(data: string | Buffer): void;
    write(cmd: Command): void;
    sendNextCommand(): Command | undefined;
    send(cmd: Command): void;
}
