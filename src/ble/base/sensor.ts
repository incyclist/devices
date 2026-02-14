import { EventEmitter } from "node:events";
import { EventLogger } from "gd-eventlog";

import { LegacyProfile } from "../../antv2/types.js";
import { sleep } from "../../utils/utils.js";
import { BleWriteProps, IBlePeripheral, BleProtocol, IBleSensor} from "../types.js";
import { beautifyUUID } from "../utils.js";

export class TBleSensor extends EventEmitter implements IBleSensor {

    static readonly protocol: BleProtocol
    protected logger: EventLogger
    protected stopRequested: boolean = false
    protected subscribeSuccess:boolean = false
    protected reconnectPromise: Promise<boolean>|undefined
    protected onDataHandler
    


    logEvent(event:any, ...args:any) {
        this.logger.logEvent(event, ...args)
    }

    constructor(protected peripheral: IBlePeripheral,props?:{ logger?:EventLogger}) {        
        super()
        this.logger = props?.logger || this.getDefaultLogger()
        this.reset()
        this.onDataHandler = this.onData.bind(this)
    }

    getPeripheral() {
        return this.peripheral
    }

    getDetectionPriority():number {
        const C = this.constructor as any
        return C['detectionPriority']??0 
       
    }

    getProfile(): LegacyProfile {
        const C = this.constructor as any
        return C['profile'] 
    }


    getProtocol(): BleProtocol {
        const C = this.constructor as any
        return C['protocol']
    }

    getServiceUUids(): string[] {
        const C = this.constructor as any
        return C['services'] 
    }

    getSupportedServiceUUids():string[] {
        return this.peripheral?.getDiscoveredServices()
        
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

    protected getRequiredCharacteristics():Array<string>|null {
        return null
    }

    async subscribe():Promise<boolean> {

        const selected = this.getRequiredCharacteristics()

        if (selected===null) {
            const res =  this.peripheral?.subscribeAll ? await this.peripheral.subscribeAll(this.onDataHandler) : false
            this.subscribeSuccess = res
            return res;
        }

        if (selected.length===0) {
            this.subscribeSuccess = true
            return true;
        }

        const res =  await this.peripheral.subscribeSelected(selected,this.onDataHandler)
        this.subscribeSuccess = res
        return res
    }

    async stopSensor(): Promise<boolean> {

        this.onDisconnect()
        this.removeAllListeners()
        if (!this.peripheral)
            return true;
        
        this.stopRequested = true
        return await this.peripheral.disconnect()
    }

    isReconnectBusy():boolean {
        return (this.reconnectPromise!==undefined)

    }

    async reconnectSensor():Promise<boolean> {
        if (this.reconnectPromise!==undefined) {
            return await this.reconnectPromise
        }
        this.reconnectPromise = this.doReconnectSensor()
        const res = await this.reconnectPromise
        delete this.reconnectPromise

        return res;
    }

    async doReconnectSensor():Promise<boolean> {
        this.onDisconnect()

        this.logEvent({message:'reconnect sensor'})
        let connected = false;
        let subscribed = false;

        let success = false


        // TODO: remove these hard coded sleeps to event based logic 
        // -------------------------------------------------
        await sleep(500)

        do {
            try {
                if (!connected) {
                    connected = await this.startSensor(true)
                }

                if (connected && !subscribed) {
                    subscribed = await this.subscribe()
                    
                }
            }
            catch  { 
                // ignore
            }


            success = connected && subscribed        
            if (!success) {
                await sleep(1000)
            }
            if (!this.stopRequested)
                this.logEvent({message:'reconnect sensor retry'})

        } while (!success || this.stopRequested)

        this.logEvent({message:'reconnect sensor completed',success, stopRequested:this.stopRequested})
        return success

    }


    reset(): void {
        throw new Error("Method not implemented.");
    }
    isConnected():boolean   {
        return this.peripheral?.isConnected()
    }

    isSubscribed(): boolean {
        return this.subscribeSuccess
    }

    protected onDisconnect() {
        this.subscribeSuccess = false
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



