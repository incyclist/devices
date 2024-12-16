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


    logEvent(event, ...args) {
        this.logger.logEvent(event, ...args)
    }

    constructor(protected peripheral: IBlePeripheral,props?:{ logger?:EventLogger}) {        
        super()
        this.logger = props?.logger || this.getDefaultLogger()
        this.reset()
    }

    get services(): string[] {
        if (!this.peripheral)
            return this.getServiceUUids()

        return this.peripheral?.services.map(s => s.uuid)
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


    async startSensor(reconnect?: boolean): Promise<boolean> {

        if (!reconnect)
            this.stopRequested = false

        if (!this.peripheral) {
            // TODO: wait for a device to be announced
            console.log('~~~ Device not found (yet) ~~~')
        }

        const connected = await this.peripheral.connect()
        if (!connected)
            return false

        if (!reconnect)
            this.peripheral.onDisconnect(this.reconnectSensor.bind(this))

        return await this.peripheral.subscribeAll(this.onData.bind(this))
    }

    async stopSensor(): Promise<boolean> {
        this.stopRequested = true
        return await this.peripheral.disconnect()
    }

    async reconnectSensor() {
        let success = false
        do {
            success = await this.startSensor(true)
        
            if (!success) {
                await sleep(5000)
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
        return this.peripheral?.read(characteristicUUID)
    }

    write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer> {
        return this.peripheral?.write(characteristicUUID, data, options)
    }

    onData(characteristic:string,data: Buffer): boolean {

        //console.log('onData',characteristic,data.toString('hex'))
        return true
    }

    protected getDefaultLogger(): EventLogger {
        return new EventLogger(this.constructor.name)
    }

}



