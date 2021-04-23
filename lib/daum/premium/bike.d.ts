/// <reference types="node" />
import { Queue } from '../../utils';
import { EventLogger } from 'gd-eventlog';
declare class Daum8i {
    portName: string;
    logger: EventLogger;
    serial: boolean;
    tcpip: boolean;
    tcpipConnection: {
        host: string;
        port: string;
    };
    port: string;
    settings: any;
    sendRetryDelay: number;
    sp: any;
    connected: boolean;
    blocked: boolean;
    state: any;
    bikeData: any;
    processor: any;
    error: Error;
    queue: Queue<any>;
    cmdWorker: any;
    cmdCurrent: any;
    cmdStart: number;
    constructor(props: any);
    static getClassName(): string;
    getType(): string;
    static setSerialPort(spClass: any): void;
    static setNetImpl(netClass: any): void;
    static getSupportedInterfaces(): string[];
    getPort(): string;
    isConnected(): boolean;
    setUser(user: any, callback: any): void;
    getUserWeight(): any;
    getBikeWeight(): number;
    unblock(): void;
    connect(): void;
    reconnect(): Promise<void>;
    saveConnect(): Promise<unknown>;
    onPortOpen(): void;
    onPortClose(): void;
    onPortError(error: any): NodeJS.Timeout;
    errorHandler(): void;
    saveClose(force?: any): Promise<unknown>;
    close(): void;
    sendTimeout(message: any): void;
    checkForTimeout(reject: any): void;
    getTimeoutValue(cmd?: any): number;
    onData(data: any): any;
    sendDaum8iCommand(command: any, queryType: any, payload: any): Promise<unknown>;
    sendACK(): void;
    sendNAK(): void;
    sendReservedDaum8iCommand(command: any, cmdType: any, data: any): Promise<any[]>;
    getProtocolVersion(): Promise<string>;
    getDashboardVersion(): Promise<unknown>;
    getDeviceType(): Promise<any>;
    getActualBikeType(): Promise<any>;
    setActualBikeType(actualBikeType: any): Promise<any>;
    getTrainingData(): Promise<{
        time: number;
        heartrate: number;
        speed: number;
        slope: number;
        distance: number;
        cadence: number;
        power: number;
        physEnergy: number;
        realEnergy: number;
        torque: number;
        gear: number;
        deviceState: number;
        speedStatus: string;
    }>;
    setLoadControl(enabled: any): Promise<boolean>;
    getLoadControl(): Promise<boolean>;
    setSlope(slope: any): void;
    setPower(power: any): Promise<number>;
    getPower(power: any): Promise<number>;
    setPerson(person: any): Promise<any[]>;
    setGear(gear: any): Promise<number>;
    getGear(): Promise<number>;
}
export declare class Daum8iTcp extends Daum8i {
    static getClassName(): string;
    getType(): string;
    static setSerialPort(spClass: any): void;
    static setNetImpl(netClass: any): void;
    static getSupportedInterfaces(): string[];
}
export declare class Daum8iSerial extends Daum8i {
    static getClassName(): string;
    getType(): string;
    static setSerialPort(spClass: any): void;
    static setNetImpl(netClass: any): void;
    static getSupportedInterfaces(): string[];
}
export {};
