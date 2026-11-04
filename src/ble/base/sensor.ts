import { EventEmitter } from "node:events";
import { EventLogger } from "gd-eventlog";

import { LegacyProfile } from "../../antv2/types.js";
import { runWithTimeout, sleep } from "../../utils/utils.js";
import { BleWriteProps, IBlePeripheral, BleProtocol, IBleSensor} from "../types.js";
import { beautifyUUID } from "../utils.js";

export class TBleSensor extends EventEmitter implements IBleSensor {

    static readonly protocol: BleProtocol
    // upper bound for a single reconnect attempt (connect + discovery + subscribe)
    static readonly RECONNECT_ATTEMPT_TIMEOUT = 20000

    protected logger: EventLogger
    protected stopRequested: boolean = false
    protected subscribeSuccess:boolean = false
    protected reconnectPromise: Promise<boolean>|undefined
    protected connectPromise: Promise<boolean>|undefined
    protected reconnectAttemptTimeout: number = TBleSensor.RECONNECT_ATTEMPT_TIMEOUT
    protected reconnectCount: number = 0
    protected onDataHandler

    logEvent(event:any, ...args:any) {
        try { 
            if (this.getPeripheral()?.getInterface()?.isLoggingPaused())
                return;
        }
        catch {}
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

        this.connectPromise = this.connectPromise ?? this.peripheral.connect()

        const connected = await this.connectPromise

        // FIXES_BACKLOG #26: clear the cached promise once it has settled (mirrors
        // BlePeripheral.connect()'s own pattern). This field only exists to dedupe *concurrent*
        // calls into startSensor() - leaving it set forever after the first call would mean a later,
        // separate startSensor() call (e.g. a retry after this peripheral was deliberately
        // disconnected because service discovery came back incomplete) never re-invokes
        // peripheral.connect() at all, so a genuinely fresh reconnect attempt could never happen.
        delete this.connectPromise

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
            return this.onSubscribeResult(res)
        }

        if (selected.length===0) {
            this.subscribeSuccess = true
            return true;
        }

        const res =  await this.peripheral.subscribeSelected(selected,this.onDataHandler)
        return this.onSubscribeResult(res)
    }

    protected onSubscribeResult(res:boolean):boolean {
        // the peripheral reports a completed subscription even if the link dropped while it was
        // subscribing - that must not be treated as success
        const success = res && this.isConnected()
        if (res && !success) {
            this.logEvent({message:'subscribe failed', reason:'not connected'})
        }
        this.subscribeSuccess = success
        return success
    }

    async stopSensor(): Promise<boolean> {

        // set synchronously, before anything else, so a command already in flight (queued
        // before this stop was requested) can recognize a subsequent "not connected" write
        // failure as this expected teardown rather than an unexpected disconnect
        this.stopRequested = true

        this.onDisconnect()
        this.removeAllListeners()
        if (!this.peripheral)
            return true;

        return await this.peripheral.disconnect()
    }

    isReconnectBusy():boolean {
        return (this.reconnectPromise!==undefined)

    }

    async reconnectSensor(connectionLost:boolean = true):Promise<boolean> {
        if (this.reconnectPromise!==undefined) {
            return await this.reconnectPromise
        }
        this.reconnectPromise = this.doReconnectSensor(connectionLost)
        const res = await this.reconnectPromise
        delete this.reconnectPromise

        return res;
    }

    /**
     * Number of reconnects that have been started on this sensor.
     *
     * Allows components that share this sensor's peripheral (e.g. the Zwift Hub service of a
     * FTMS trainer) to detect that the link was re-established and their own state is stale
     */
    getReconnectCount():number {
        return this.reconnectCount
    }

    async doReconnectSensor(connectionLost:boolean = true):Promise<boolean> {
        this.onDisconnect()
        this.reconnectCount++

        const {name,address} = this.peripheral?.getInfo()??{}

        this.logEvent({message:'reconnect sensor', name,address,connectionLost})

        let success = false
        if (connectionLost) {
            this.emit('connctionLost')
        }


        // TODO: remove these hard coded sleeps to event based logic
        // -------------------------------------------------
        await sleep(500)

        do {
            success = await this.reconnectAttempt(name,address)
            if (!success) {
                await sleep(1000)
                if (!this.stopRequested)
                    this.logEvent({message:'reconnect sensor retry', name,address})
            }

        } while (!success && !this.stopRequested)

        if (connectionLost && success) {
            this.emit('connctionRecovered')
        }


        this.logEvent({message:'reconnect sensor completed',success, stopRequested:this.stopRequested})
        return success

    }

    protected async reconnectAttempt(name:string, address:string):Promise<boolean> {
        try {
            // connect and GATT discovery are not bounded by the BLE bindings, a stalled discovery
            // would otherwise block the reconnect forever
            return await runWithTimeout(this.connectAndSubscribe(), this.reconnectAttemptTimeout)
        }
        catch (err) {
            if (err?.message==='Timeout') {
                await this.abortReconnectAttempt(name,address)
            }
            return false
        }
    }

    protected async connectAndSubscribe():Promise<boolean> {
        const connected = await this.startSensor(true)
        if (!connected)
            return false

        const subscribed = await this.subscribe()
        return subscribed && this.isConnected()
    }

    protected async abortReconnectAttempt(name:string, address:string):Promise<void> {
        this.logEvent({message:'reconnect sensor attempt timeout', name,address, timeout:this.reconnectAttemptTimeout})

        // tear down the stalled link, so that the next attempt performs a fresh connect and discovery
        delete this.connectPromise
        this.onDisconnect()
        try {
            await runWithTimeout(this.peripheral.disconnect(), this.reconnectAttemptTimeout)
        }
        catch {
            // ignore - the next attempt will try to connect again
        }
    }


    reset(): void {
        throw new Error("Method not implemented.");
    }
    isConnected():boolean   {
        return this.peripheral?.isConnected()
    }
    isReady():boolean {
        return this.isConnected() && this.connectPromise===undefined && this.reconnectPromise===undefined
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



