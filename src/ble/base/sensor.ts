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
    // how long a reconnect keeps retrying while characteristics that were in use before the link was lost
    // are not (yet) exposed by the device
    static readonly RECONNECT_CHARACTERISTICS_TIMEOUT = 30000

    protected logger: EventLogger
    protected stopRequested: boolean = false
    protected subscribeSuccess:boolean = false
    protected reconnectPromise: Promise<boolean>|undefined
    protected connectPromise: Promise<boolean>|undefined
    protected reconnectAttemptTimeout: number = TBleSensor.RECONNECT_ATTEMPT_TIMEOUT
    protected reconnectCount: number = 0
    protected reconnectCharacteristicsTimeout: number = TBleSensor.RECONNECT_CHARACTERISTICS_TIMEOUT
    protected reconnectStartedAt: number = 0
    protected reconnectAttempts: number = 0
    protected reconnectIncomplete: boolean = false
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


        this.reconnectStartedAt = Date.now()
        this.reconnectAttempts = 0

        // TODO: remove these hard coded sleeps to event based logic
        // -------------------------------------------------
        await sleep(500)

        if (connectionLost) {
            // make sure that the BLE stack (and the device) do not consider the old connection still open
            await this.releaseLink()
        }

        success = await this.reconnectUntilDone(name,address)

        if (connectionLost && success) {
            this.emit('connctionRecovered')
        }
        if (connectionLost && !success && this.reconnectIncomplete) {
            this.emit('connctionRecoveryFailed')
        }


        this.logEvent({message:'reconnect sensor completed',success, stopRequested:this.stopRequested})
        return success

    }

    // retries sequentially until an attempt succeeds or a stop is requested
    protected async reconnectUntilDone(name:string, address:string):Promise<boolean> {
        const success = await this.reconnectAttempt(name,address)
        if (success || this.stopRequested)
            return success

        // The device keeps reconnecting but does not expose characteristics that were in use before.
        // Retrying can help (the device/stack may need a moment), but not forever.
        if (this.reconnectIncomplete && Date.now()-this.reconnectStartedAt >= this.reconnectCharacteristicsTimeout) {
            this.logEvent({message:'reconnect sensor failed', name,address, reason:'used characteristics missing',
                attempts:this.reconnectAttempts, duration:Date.now()-this.reconnectStartedAt})
            return false
        }

        await sleep(1000)
        if (this.stopRequested)
            return false

        this.logEvent({message:'reconnect sensor retry', name,address})
        return this.reconnectUntilDone(name,address)
    }

    protected async reconnectAttempt(name:string, address:string):Promise<boolean> {
        this.reconnectIncomplete = false
        this.reconnectAttempts++
        try {
            // connect and GATT discovery are not bounded by the BLE bindings, a stalled discovery
            // would otherwise block the reconnect forever
            const success = await runWithTimeout(this.connectAndSubscribe(), this.reconnectAttemptTimeout)

            if (!success && this.reconnectIncomplete) {
                // tear down the link, so that the next attempt performs a fresh connect and discovery
                await this.abortIncompleteReconnectAttempt()
            }
            return success
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
        if (!subscribed || !this.isConnected())
            return false

        return await this.checkCharacteristicsRestored()
    }

    /**
     * After a reconnect the device is expected to expose the same characteristics as before the link was lost.
     * - something missing that was never used: log only, the reconnect is accepted
     * - something missing that was used (read/write/subscribe): the attempt fails and is retried
     *   (until RECONNECT_CHARACTERISTICS_TIMEOUT, see reconnectUntilDone())
     */
    protected async checkCharacteristicsRestored():Promise<boolean> {
        if (!this.peripheral?.verifyCharacteristics)
            return true

        let result:{missing:string[], missingUsed:string[]}
        try {
            result = await this.peripheral.verifyCharacteristics()
        }
        catch (err) {
            this.logEvent({message:'reconnect: characteristics check failed', reason:err?.message})
            return true
        }

        if (!result || result.missing.length===0)
            return true

        const {name,address} = this.peripheral.getInfo()??{}
        const details = {name, address, attempt:this.reconnectAttempts, duration:Date.now()-this.reconnectStartedAt,
            missing:result.missing.join('|'), missingUsed:result.missingUsed.join('|')}

        if (result.missingUsed.length===0) {
            this.logEvent({message:'reconnect: unused characteristics missing', ...details})
            return true
        }

        this.reconnectIncomplete = true
        this.logEvent({message:'reconnect: used characteristics missing', ...details})
        return false
    }

    protected async abortIncompleteReconnectAttempt():Promise<void> {
        delete this.connectPromise
        this.onDisconnect()
        try {
            await runWithTimeout(this.peripheral.disconnect(), this.reconnectAttemptTimeout)
        }
        catch {
            // ignore - the next attempt will try to connect again
        }
    }

    protected async releaseLink():Promise<void> {
        try {
            await this.peripheral?.releaseLink?.()
        }
        catch {
            // ignore
        }
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



