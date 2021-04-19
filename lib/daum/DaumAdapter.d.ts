import { EventLogger } from 'gd-eventlog';
import DeviceAdapterBase, { DeviceAdapter } from '../Device';
interface DaumAdapter {
    getCurrentBikeData(): Promise<any>;
}
export default class DaumAdapterBase extends DeviceAdapterBase implements DeviceAdapter, DaumAdapter {
    bike: any;
    ignoreHrm: boolean;
    ignoreBike: boolean;
    ignorePower: boolean;
    distanceInternal: number;
    paused: boolean;
    data: any;
    currentRequest: any;
    requests: Array<any>;
    iv: any;
    logger: EventLogger;
    constructor(props: any, bike: any);
    getCurrentBikeData(): Promise<any>;
    getBike(): any;
    isBike(): boolean;
    isPower(): boolean;
    isHrm(): boolean;
    setIgnoreHrm(ignore: any): void;
    setIgnoreBike(ignore: any): void;
    initData(): void;
    startUpdatePull(): void;
    connect(): void;
    close(): any;
    logEvent(event: any): void;
    sendBikeUpdate(request: any): Promise<unknown>;
    stop(): Promise<boolean>;
    pause(): Promise<boolean>;
    resume(): Promise<boolean>;
    sendUpdate(data: any): Promise<void>;
    update(): Promise<void>;
    updateData(data: any, bikeData: any): any;
    transformData(bikeData: any): any;
}
export {};
