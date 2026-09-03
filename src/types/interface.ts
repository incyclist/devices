import { EventEmitter } from "node:events";
import { EventLogger } from "gd-eventlog";
import { IncyclistScanProps, DeviceSettings } from "./device.js";


export type InterfaceProps = {
    binding?: any, 
    logger?:EventLogger,
    log?:boolean
    enabled?:boolean
}


export interface IncyclistInterface extends EventEmitter{
    getName(): string;
    setBinding(binding: any): void;
    connect(reconnect?:boolean): Promise<boolean>;
    disconnect(): Promise<boolean>;
    terminate(): Promise<void>;
    isConnected(): boolean;
    scan(props: IncyclistScanProps): Promise<DeviceSettings[]>;
    stopScan(): Promise<boolean>
    addKnownDevice?(settings: DeviceSettings): void 
    pauseLogging():void
    resumeLogging():void

    /**
     * Optional. Suspends any unsolicited background work this interface performs on its own
     * initiative, e.g. the peripheral scan BLE keeps running so that a later scan request does
     * not have to wait for devices to be re-discovered.
     *
     * This does NOT disconnect the interface and does NOT affect work a caller explicitly asked
     * for: connected devices keep streaming, and an explicit [[scan]] still runs. Implementations
     * must be idempotent, and must treat this as a desired state rather than a one-off action -
     * background work must stay suspended across a disconnect/reconnect until
     * [[resumeBackgroundActivity]] is called.
     */
    pauseBackgroundActivity?():Promise<void>

    /**
     * Optional. Resumes the background work suspended by [[pauseBackgroundActivity]].
     *
     * Safe to call while the interface is disconnected - background work then resumes by itself
     * once the interface reconnects.
     */
    resumeBackgroundActivity?():Promise<void>

}
