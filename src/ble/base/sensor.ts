import { sleep } from "../../utils/utils";
import { TBleSensor, BleWriteProps, IBlePeripheral, BleProtocol} from "../types";
import { EventLogger } from "gd-eventlog";

export class BleSensor  extends TBleSensor {

    protected logger: EventLogger
    protected stopRequested: boolean

    constructor(protected peripheral: IBlePeripheral,props?:{ logger?:EventLogger}) {        
        super(peripheral,props)
        
        this.logger = props?.logger || new EventLogger('BleSensor')

    }

    logEvent(event, ...args) {
        this.logger.logEvent(event, ...args)
    }


    get services(): string[] {
        return this.peripheral.services.map(s => s.uuid)
    }

    reset():void {
        throw new Error("Method not implemented.");
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

    async reconnectSensor() {
        let success = false
        do {
            success = await this.startSensor(true)
        
            if (!success) {
                await sleep(5000)
            }
        } while (!success || this.stopRequested)
    }

    async stopSensor(): Promise<boolean> {
        this.stopRequested = true
        return await this.peripheral.disconnect()
    }

    isConnected():boolean   {
        return this.peripheral.isConnected()
    }

    read(characteristicUUID: string): Promise<Buffer> { 
        return this.peripheral.read(characteristicUUID)
    }

    write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer> {
        return this.peripheral.write(characteristicUUID, data, options)
    }

    onData(characteristic:string,data: Buffer): boolean {

        //console.log('onData',characteristic,data.toString('hex'))
        return true
    }

}