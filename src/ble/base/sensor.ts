import { LegacyProfile } from "../../antv2/types";
import { sleep } from "../../utils/utils";
import { BleWriteProps, IBlePeripheral, BleProtocol, IBleSensor} from "../types";
import { EventLogger } from "gd-eventlog";
import { beautifyUUID } from "../utils";
import EventEmitter from "events";

export class TBleSensor extends EventEmitter implements IBleSensor {

    static readonly protocol: BleProtocol
    protected logger: EventLogger
    protected stopRequested: boolean
    protected onDataHandler


    logEvent(event, ...args) {
        this.logger.logEvent(event, ...args)
    }

    constructor(protected peripheral: IBlePeripheral,props?:{ logger?:EventLogger}) {        
        super()
        this.logger = props?.logger || this.getDefaultLogger()
        this.reset()
        this.onDataHandler = this.onData.bind(this)
    }

    getDetectionPriority():number {
        const C = this.constructor as typeof TBleSensor
        return C['detectionPriority']??0 
       
    }

    getProfile(): LegacyProfile {
        const C = this.constructor as typeof TBleSensor
        return C['profile'] 
    }


    getProtocol(): BleProtocol {
        const C = this.constructor as typeof TBleSensor
        return C['protocol']
    }

    getServiceUUids(): string[] {
        const C = this.constructor as typeof TBleSensor
        return C['services'] 
    }

    isMatching(serviceUUIDs: string[]): boolean {             
        const uuids = serviceUUIDs.map( uuid=>beautifyUUID(uuid))

        const required = this.getServiceUUids()
        if (!required)
            return true

        let missing = false;
        required.forEach( uuid => {
            if (!uuids.includes(beautifyUUID(uuid))) {
                missing = true
            }
        })
        return (missing===false)
    }

    hasPeripheral():boolean {
        return !!this.peripheral
    }

    async pair(): Promise<boolean> {
        // normally there is no pairing required, i.e. default should immediately return TRUE
        return true
    }


    async startSensor(reconnect?: boolean): Promise<boolean> {

        if (!reconnect)
            this.stopRequested = false

        if (!this.peripheral) {
            this.logEvent( {message:'no peripheral'})
            return false
        }

        const connected = await this.peripheral.connect()
        if (!connected)
            return false

        if (!reconnect)
            this.peripheral.onDisconnect(this.reconnectSensor.bind(this))

        return true;
    }

    protected getRequiredCharacteristics():Array<string> {
        return null
    }

    async subscribe():Promise<boolean> {
        const selected = this.getRequiredCharacteristics()

        if (selected===null) {
            const res =  await this.peripheral.subscribeAll(this.onDataHandler)
            return res;
        }

        if (selected.length===0) {
            return true;
        }

        const res =  await this.peripheral.subscribeSelected(selected,this.onDataHandler)
        return res
    }

    async stopSensor(): Promise<boolean> {

        this.removeAllListeners()
        if (!this.peripheral)
            return true;
        
        this.stopRequested = true
        return await this.peripheral.disconnect()
    }

    async reconnectSensor() {
        let connected = false;
        let subscribed = false;

        let success = false
        do {
            if (!connected) {
                connected = await this.startSensor(true)
            }

            if (connected && !subscribed) {
                subscribed = await this.subscribe()
            }

            success = connected && subscribed        
            if (!success) {
                await sleep(1000)
            }
        } while (!success || this.stopRequested)

    }


    reset(): void {
        throw new Error("Method not implemented.");
    }
    isConnected():boolean   {
        return this.peripheral?.isConnected()
    }
    read(characteristicUUID: string): Promise<Buffer> { 
        if (!this.isConnected()) {
            return Promise.reject(new Error('not connected'))
        }

        return this.peripheral?.read(characteristicUUID)
    }

    write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer> {
        if (!this.isConnected()) {
            return Promise.reject(new Error('not connected'))
        }
        return this.peripheral?.write(characteristicUUID, data, options)
    }

    onData(characteristic:string,data: Buffer): boolean {
        return true
    }

    getAnnouncement() {
        return this.peripheral
    }

    protected getDefaultLogger(): EventLogger {
        return new EventLogger(this.constructor.name)
    }

}



