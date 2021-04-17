export class Daum8iTcp extends Daum8i {
    constructor(props: any);
}
export class Daum8iSerial extends Daum8i {
    constructor(props: any);
}
declare class Daum8i {
    static getClassName(): string;
    static setSerialPort(spClass: any): void;
    static setNetImpl(netClass: any): void;
    static getSupportedInterfaces(): string[];
    constructor(props: any);
    LOG: EventLogger;
    portName: any;
    tcpip: boolean;
    serial: boolean;
    tcpipConnection: {
        host: any;
        port: any;
    };
    port: any;
    settings: any;
    sendRetryDelay: number;
    sp: any;
    connected: boolean;
    blocked: boolean;
    state: {
        ack: {
            wait: boolean;
            startWait: any;
        };
        commandsInQueue: {};
    };
    bikeData: {
        userWeight: number;
        bikeWeight: number;
        maxPower: number;
    };
    processor: IndoorBikeProcessor;
    getType(): string;
    getPort(): any;
    isConnected(): boolean;
    setUser(user: any, callback: any): void;
    getUserWeight(): any;
    getBikeWeight(): number;
    unblock(): void;
    connect(retry: any): void;
    firstOpen: boolean;
    reconnect(): Promise<void>;
    saveConnect(): Promise<any>;
    onPortOpen(): void;
    error: any;
    onPortClose(): void;
    onPortError(error: any): NodeJS.Timeout;
    errorHandler(): void;
    saveClose(force: any): Promise<any>;
    close(): void;
    bikeCmdWorker: any;
    queue: any;
    sendTimeout(message: any): void;
    cmdCurrent: any;
    cmdStart: any;
    checkForTimeout(reject: any): void;
    getTimeoutValue(cmd: any): number;
    onData(data: any): void;
    sendDaum8iCommand(command: any, queryType: any, payload: any, cb: any): Promise<any>;
    sendACK(): void;
    sendNAK(): void;
    sendReservedDaum8iCommand(command: any, cmdType: any, data: any, onData: any, onError: any): Promise<any[]>;
    getProtocolVersion(): Promise<string>;
    getDashboardVersion(): Promise<any>;
    getDeviceType(): Promise<string>;
    getActualBikeType(): Promise<string>;
    setActualBikeType(actualBikeType: any): Promise<string>;
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
import { EventLogger } from "gd-eventlog";
import IndoorBikeProcessor from "../indoorbike.js";
export {};
