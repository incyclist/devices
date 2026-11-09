import { EventEmitter } from "node:events";
import { DeviceSettings, InterfaceProps } from "../../types/index.js";
import { EventLogger } from "gd-eventlog";
import { DirectConnectBinding, MulticastDnsAnnouncement } from "../bindings/index.js";
import { DirectConnectScanProps } from "../types.js";
import { BleDeviceSettings, BleProtocol, IBleInterface, IBlePeripheral } from '../../ble/types.js';
import { InteruptableTask,  TaskState } from "../../utils/task.js";
import { DirectConnectPeripheral, OpenBikeControlPeripheral } from "./peripheral.js";
import { beautifyUUID, BleAdapterFactory, matches } from "../../ble/index.js";
import { TBleSensor } from "../../ble/base/sensor.js";
import { InterfaceFactory } from "../../ble/base/types.js";
import { CSC, CSP } from "../../ble/consts.js";
import { WAHOO_ADVANCED_FTMS } from "../../ble/wahoo/consts.js";
import { OBC_SERVICE } from "../../ble/openbikecontrol/consts.js";

const DC_TYPE = 'wahoo-fitness-tnp'
const DC_PORT = 36866
const DC_EXPIRATION_TIMEOUT = 10*1000*60 // 10min
const DC_PROBE_TIMEOUT = 2000             // max time to wait for a TCP probe
const DC_REPROBE_INTERVAL = 5000          // pause between probes while waiting for a device
const DC_WAIT_LIFETIME = 5*60*1000        // stop re-probing a device after 5min
const OBC_TYPE = 'openbikecontrol'


interface Announcement {
    service: MulticastDnsAnnouncement,
    ts: number
    source?:string
}

let instanceId = 0;

/**
 * Direct Connect Interface class.
 * 
 * This class provides an interface to detect devices in Direct Connect protocol.
 *
 * @class
 * @public 
 * 
 */

export default class DirectConnectInterface   extends EventEmitter implements IBleInterface<MulticastDnsAnnouncement> { 

    protected static _instance:DirectConnectInterface
     /**
     * The name of the interface.
     */
    static readonly INTERFACE_NAME:string = 'wifi'

    protected logger: EventLogger
    protected props: InterfaceProps
    protected logEnabled: boolean
    protected binding: DirectConnectBinding
    protected debug: boolean
    protected logDisabled: boolean
    protected internalEvents: EventEmitter
    protected services: Announcement[] = []
    protected scanTask: InteruptableTask<TaskState,DeviceSettings[]>|undefined;
    protected matching?:Array<string> = []
    protected instance:number
    protected connected: boolean = false;
    protected pendingWaits: Map<string,{promise:Promise<IBlePeripheral>, cancel:()=>void}> = new Map()

    /**
     * Desired state for the mDNS browsers. Deliberately not cleared by disconnect(): discovery
     * must stay suspended across a reconnect until it is resumed.
     */
    protected backgroundPaused: boolean = false;
    

    static getInstance(props:InterfaceProps={}): DirectConnectInterface {
        if (DirectConnectInterface._instance===undefined)
            DirectConnectInterface._instance = new DirectConnectInterface(props)

        else {  
            DirectConnectInterface._instance.setProps(props)
            if ( props.binding) {
                DirectConnectInterface._instance.setBinding(props.binding)
            }
            if ( props.logger) {
                DirectConnectInterface._instance.logger = props.logger
            }
            if ( props.log && !DirectConnectInterface._instance.logger) { 
                DirectConnectInterface._instance.logger = new EventLogger( 'DirectConnect');
            }
        }

        return DirectConnectInterface._instance
    }

    /**
     * Creates a new DirectConnectInterface instance.
     * @param {InterfaceProps} props - The properties of the interface.
     */
    constructor(props:InterfaceProps) {  
        super()

        this.props = props;       
        this.logEnabled = props.log||true

        const {binding} = props;

        this.setLogger(props.logger??new EventLogger( 'DirectConnect'))
        if (binding) {
            this.setBinding(binding)

        }
        this.internalEvents = new EventEmitter()
        this.instance = ++instanceId

        const {enabled} = props
        if (this.binding && (enabled??false))
            this.autoConnect()
    }

    setProps(props:InterfaceProps) {
        this.props = props
    }


    createPeripheral(announcement: MulticastDnsAnnouncement): IBlePeripheral {
        if (announcement.type===OBC_TYPE)
            return OpenBikeControlPeripheral.create(announcement)
        return DirectConnectPeripheral.create(announcement)
    }

    // WiFi/mDNS peripherals have no BLE-style GATT service-completeness check (DirectConnectPeripheral
    // doesn't implement one) - this only exists to satisfy the shared IBleInterface contract.
    getSupportedServices(): string[] {
        return []
    }


    createDeviceSetting(service:MulticastDnsAnnouncement):BleDeviceSettings {
        try {
            const name = service.name
            const protocol = this.getProtocol(service)
            const address = service.address
            const services = service.serviceUUIDs?.map(uuid=> beautifyUUID(uuid,false))?.join(',')
            // opportunistically use the announcement's own serialNo (when present) as a stable id -
            // this fully resolves same-name ambiguity for devices that provide it (see FIXES_BACKLOG #14)
            const id = service.serialNo || undefined

            return {interface:DirectConnectInterface.INTERFACE_NAME, name, protocol,address, services, ...(id?{id}:{}) }
        }
        catch {
            return null
        }
    }

    createPeripheralFromSettings(settings: DeviceSettings): IBlePeripheral {
        const bleSettings = settings as BleDeviceSettings
        const all = this.getAll()

        // prefer an exact name+address match when the settings carry an address - this matters once
        // two devices share the same name (see FIXES_BACKLOG #14): a name-only lookup could otherwise
        // resolve to the wrong physical device
        const info = (bleSettings.address && all.find(a=>a.service.name===settings.name && a.service.address===bleSettings.address))
            ?? all.find(a=>a.service.name === settings.name)

        if (!info?.service)
            return null;
        return this.createPeripheral(info.service)
    }

    /**
     * Add a Wifi device to the known-device registry (i.e. peripheral cache) using the provided settings.
     * This allows the interface to recognize and connect to devices based on pre-defined configurations 
     * in case MulticastDNS announcements are not available.
     *
     * @param settings - The device settings as specfied in `BleDeviceSettings`.
     *
     * @remarks
     * - If an announcement cannot be created from the provided settings, this method is a no-op.
     * - The method performs side effects (creates an announcement and registers a service).
     * - This method does not return a value and does not throw on unsupported configurations.
     */
    addKnownDevice(settings: BleDeviceSettings): void {
        const announcement = this.createAnnouncementFromSettings(settings)
        if (announcement) {
            this.addService(announcement,'known-device')
        }
        // not supported
    }



    /**
     * Gets the logger instance.
     * @returns {EventLogger} The logger instance.
     */
    getLogger() {
        return this.logger
    }

    /**
     * Sets the logger instance.
     * @param {EventLogger} logger - The logger instance.
    */
    setLogger(logger:EventLogger) {
        this.logger = logger
    }

    /**
    * Gets the name of the interface.
    * @returns {string} The name of the interface.
    */
    getName(): string {
        return DirectConnectInterface.INTERFACE_NAME
    } 

    /**
     * Sets the binding for this instance
     * 
     * Bindings are used to allow providing functionality on different patforms, 
     * e.g. on Desktop(Electron), the binding will be using IPC between Web and Electron App
     *      on Mobile(React Native), the binding might require native code
     * @param {DirectConnectBinding} binding - The binding instance.
     */
    setBinding(binding: DirectConnectBinding): void {

        const prev=this.binding
        this.binding = binding

        if (!prev && this.props.enabled)
            this.autoConnect()

    }

    /**
     * Gets the binding instance.
     * @returns {DirectConnectBinding} The binding instance.
     */
    getBinding() {
        return this.binding
    }

    autoConnect():void {
        this.connect()
    }

    /**
     * Connects to the interface.
     * @param {boolean} [reconnect=false] - Whether the connection is originated from a reconnect
     * 
     * @returns {Promise<boolean>} Whether the connection was successful.
     */
    async connect(reconnect?:boolean): Promise<boolean> {

        if (this.connected) {
            return true
        }

        try {
            if (!this.getBinding()?.mdns) {
                this.logEvent({message:'Direct Connect not available'})
                return false;
            }
            this.logEvent({message:'connecting to Direct Connect'})
            this.getBinding().mdns.connect()

            this.startServiceDiscovery(reconnect)

        }
        catch (err:any) {
            this.logError(err, 'connect')
            return false
        }

        this.connected = true;
        this.emit('connected')
        return true;

    }

    /**
     * Starts the continuous mDNS browsers used to discover devices on the network.
     *
     * Skipped while background activity is paused, so that a connect() or reconnect during that
     * period does not silently restart discovery.
     */
    protected startServiceDiscovery(reconnect?:boolean):void {
        if (this.backgroundPaused)
            return

        if (!reconnect)
            this.logEvent({message:'starting multicast DNS scan ..'})

        this.getBinding().mdns.find( null,( service:MulticastDnsAnnouncement )=>{
            this.addService( service,'unfiltered' )  

        } )

        this.getBinding().mdns.find( {type:DC_TYPE},( service:MulticastDnsAnnouncement )=>{
            this.addService( service, DC_TYPE )  

        } )

        // started after the Direct Connect browser, so that smart trainers are found first
        this.getBinding().mdns.find( {type:OBC_TYPE},( service:MulticastDnsAnnouncement )=>{
            // some bindings deliver all announcements to all callbacks
            if (service.type && service.type!==OBC_TYPE)
                return
            if (service.serviceUUIDs?.length && !service.serviceUUIDs.some( uuid=>matches(uuid,OBC_SERVICE)))
                return
            this.addService( {...service, type:OBC_TYPE}, OBC_TYPE )  
        } )
    }

    async pauseBackgroundActivity():Promise<void> {
        if (this.backgroundPaused)
            return

        // Set first: some bindings' disconnect() can throw (e.g. desktop's, which tears down a
        // UDP multicast socket) and the desired state should hold regardless - the worst case of
        // treating a failed release as 'paused' is that discovery stays suspended a bit longer
        // than intended, which is far preferable to it silently continuing unnoticed.
        this.backgroundPaused = true
        this.logEvent({message:'pausing background activity'})
        this.cancelWaits()

        try {
            // Releases the mDNS browsers. On mobile this also releases the wifi multicast lock
            // they hold, which otherwise disables the wifi chip's multicast filtering for the
            // whole process lifetime.
            this.getBinding()?.mdns?.disconnect()
        }
        catch(err:any) {
            this.logError(err, 'pauseBackgroundActivity')
        }
    }

    async resumeBackgroundActivity():Promise<void> {
        if (!this.backgroundPaused)
            return

        this.backgroundPaused = false
        this.logEvent({message:'resuming background activity'})

        // If not connected, discovery is started by connect() once the interface comes back.
        if (!this.isConnected())
            return

        try {
            this.getBinding()?.mdns?.connect()
            this.startServiceDiscovery()
        }
        catch(err:any) {
            // backgroundPaused is already false, matching the interface's connect() convention:
            // a binding failure here is reported, not retried, and self-heals on the next
            // connect()/reconnect once the binding recovers.
            this.logError(err, 'resumeBackgroundActivity')
        }
    }

    /**
     * Disconnects from the interface and cleans up resources
     * @returns {Promise<boolean>} Whether the disconnection was successful.
     */
    async disconnect(): Promise<boolean> {
        if (!this.isConnected())
            return true
        this.logEvent({message:'Disconnecting from Direct Connect'})

        await this.stopScan()
        return true
    }


    async terminate():Promise<void> {
        await this.disconnect()

        this.getBinding()?.mdns?.disconnect()
        this.internalEvents.removeAllListeners()
        this.connected =  false

        const disconnected = !this.isConnected()

        if (disconnected)
            this.emit('disconnect')

    }


    /**
    * Checks if the interface is connected.
    * @returns {boolean} Whether the interface is connected.
    */
    isConnected(): boolean {
        return this.connected && this.getBinding()?.mdns!==undefined && this.binding.mdns!==null
    }

    /**
    * Scans for devices.
    * @param {DirectConnectScanProps} props - The scan properties.
    * 
    * @emits device   {DeviceSettings} a device that was found during the scan

    * @returns {Promise<DeviceSettings[]>} The list of device settings.
    */
    async scan(props: DirectConnectScanProps): Promise<DeviceSettings[]> {
        this.logDisabled = false

        if (this.isScanning()) {
            this.logEvent({message:'starting scan - already scanning'})
            await this.scanTask?.getPromise()
        }

        this.logEvent({message:'starting scan ..'})

        // disconnect and reconnect, so that we force a new multicast-dns scan
        // otherise devices might not get re-announced (and timeout)
        await this.reconnect()       

        this.scanTask = new InteruptableTask(this.startScan(),{ 
            timeout:props.timeout,
            state: { matching:[]},
            name:'scan',
            errorOnTimeout: false,
            log: this.logEvent.bind(this),
            onDone: this.onScanDone.bind(this)
        })
        return this.scanTask.run()


    }
    async stopScan(): Promise<boolean> {
        if (!this.isScanning()) 
                return true

        this.logEvent({message:'stopping scan ...', interface:'wifi'})
        const res = await this.scanTask?.stop()
        delete this.scanTask
        return (res===true)
    }

    onScanDone():DeviceSettings[] { 
        this.logEvent({message:'scan stopped'})                
        return this.buildDeviceSettings(this.matching)
    }

    pauseLogging() {
        this.logDisabled = true
    }


    resumeLogging() {
        this.logDisabled = false
    }

    isLoggingPaused(): boolean {
        return this.logDisabled
    }

    /**
     * Waits until the device described by `settings` is reachable and returns its peripheral.
     *
     * A cached entry (real mDNS observation or a placeholder built from saved settings) is only
     * returned after its address:port has been probed successfully. Otherwise we keep waiting for
     * a real mDNS announcement and re-probe periodically (a device that is switched off would
     * otherwise fail the connect and send the caller into a noisy retry loop).
     *
     * Concurrent calls for the same device share one wait.
     */
    waitForPeripheral(settings:DeviceSettings): Promise<IBlePeripheral> {
        const key = `${settings.name}|${(settings as BleDeviceSettings).address??''}`

        const pending = this.pendingWaits.get(key)
        if (pending) return pending.promise

        let cancel: ()=>void = ()=>{}
        const promise = new Promise<IBlePeripheral>( (resolve)=> {
            cancel = this.runWait(key, settings, resolve)
        })
        this.pendingWaits.set(key, {promise, cancel})
        return promise
    }

    protected runWait(key:string, settings:DeviceSettings, resolve:(p:IBlePeripheral)=>void): ()=>void {
        const start = Date.now()
        let probes = 0
        let lastResult: string|undefined
        let finished = false
        let timer: ReturnType<typeof setTimeout>|undefined

        const cleanup = ()=> {
            finished = true
            if (timer) clearTimeout(timer)
            this.off('device', onDevice)
            this.pendingWaits.delete(key)
        }

        const succeed = (peripheral:IBlePeripheral, source:'probe'|'mdns')=> {
            if (finished) return
            cleanup()
            this.logEvent({message:'wifi device reachable', device:settings.name, address:(settings as BleDeviceSettings).address??'', source, waitedMs:Date.now()-start, probes})
            resolve(peripheral)
        }

        const onDevice = (device:BleDeviceSettings)=> {
            if (finished || device.name!==settings.name) return
            const peripheral = this.createPeripheralFromSettings(settings)
            if (peripheral) succeed(peripheral,'mdns')
        }

        const attempt = async (trigger:'start'|'reprobe')=> {
            if (finished) return
            const entry = this.findEntry(settings)

            if (entry) {
                const {address, port} = entry.service
                const t0 = Date.now()
                const result = await this.probePort(address, port)
                if (finished) return
                probes++

                if (result!==lastResult) {
                    lastResult = result
                    this.logEvent({message:'wifi device probe', device:settings.name, address, port, result, durationMs:Date.now()-t0, trigger})
                }

                if (result==='open' || result==='skipped') {
                    entry.ts = Date.now()
                    const peripheral = this.createPeripheralFromSettings(settings)
                    if (peripheral) return succeed(peripheral,'probe')
                }
            }

            if (Date.now()-start >= DC_WAIT_LIFETIME) {
                this.logEvent({message:'wifi device wait abandoned', device:settings.name, address:(settings as BleDeviceSettings).address??'', waitedMs:Date.now()-start, probes})
                cleanup()
                return
            }
            timer = setTimeout( ()=>{ void attempt('reprobe') }, DC_REPROBE_INTERVAL)
        }

        this.on('device', onDevice)
        void attempt('start')

        return cleanup
    }

    /**
     * Checks if a TCP connection to address:port can be established.
     * Resolves with 'skipped' if the platform provides no socket binding (older desktop shells),
     * so that callers fall back to the previous (probe-less) behaviour.
     */
    protected probePort(address:string, port:number, timeout:number=DC_PROBE_TIMEOUT): Promise<'open'|'closed'|'timeout'|'error'|'skipped'> {
        const net = this.getBinding()?.net
        if (!net?.createSocket || !address) return Promise.resolve('skipped')

        return new Promise( resolve => {
            let socket: ReturnType<typeof net.createSocket>|undefined
            let timer: ReturnType<typeof setTimeout>|undefined
            let settled = false

            const done = (result:'open'|'closed'|'timeout'|'error')=> {
                if (settled) return
                settled = true
                if (timer) clearTimeout(timer)
                try {
                    socket?.removeAllListeners()
                    socket?.on('error',()=>{})
                    socket?.destroy()
                }
                catch { /* ignore */ }
                resolve(result)
            }

            try {
                socket = net.createSocket()
                socket.once('connect', ()=>done('open'))
                socket.once('error', (err:any)=> done( err?.code==='ETIMEDOUT' ? 'timeout' : 'closed'))
                socket.once('timeout', ()=>done('timeout'))
                timer = setTimeout( ()=>done('timeout'), timeout)
                socket.connect(port, address)
            }
            catch (err:any) {
                this.logError(err,'probePort')
                done('error')
            }
        })
    }

    protected findEntry(settings:DeviceSettings):Announcement|undefined {
        const bleSettings = settings as BleDeviceSettings
        const all = this.getAll()
        return (bleSettings.address && all.find(a=>a.service.name===settings.name && a.service.address===bleSettings.address))
            || all.find(a=>a.service.name === settings.name)
    }

    protected cancelWaits() {
        const waits = Array.from(this.pendingWaits.values())
        waits.forEach( w=>w.cancel() )
        this.pendingWaits.clear()
    }



    protected async reconnect() {
        await this.disconnect()
        await this.connect(true)
    }

    protected isScanning() {
        return this.scanTask?.isRunning()
    }

    protected startScan():Promise<void> {
        this.logEvent({message:'scan started',success:this.isScanning()})   
        this.emitCachedDevices();

        return  new Promise( ()=>{
            //  wait indefinitely (until stopped)
        })        
    }

    private emitCachedDevices() {
        const announced = this.getAll();
        this.matching = announced.map(a => a.service.name);

        // placeholders built from saved settings are unverified (the device might be switched off) -
        // they are only handed out by waitForPeripheral() after a successful probe
        announced.filter(a => a.source!=='known-device').forEach(a => {
            this.emitDevice(a.service);
        });
    }

    protected emitDevice(service:MulticastDnsAnnouncement) {
        const device = this.createDeviceSetting(service);
        if (!device) return;

        this.emit('device',device,service)
    }


    protected buildDeviceSettings(matching:string[]=[]) {

        return matching.map( (name)=> ({interface:DirectConnectInterface.INTERFACE_NAME, name}) )
    }



    /**
     * Adds/refreshes a discovered (or known-device placeholder) announcement in the session
     * discovery cache.
     *
     * Wifi/mDNS devices are identified essentially by name (see `BleDeviceSettings` - there is no
     * dedicated wifi identity type), which creates two related problems this method resolves with
     * a session-scoped heuristic (see FIXES_BACKLOG #14):
     *
     * (a) If two announcements with the *same name* but *different addresses* are observed within
     *     one session, that is proof of two physical devices (one device can't emit two addresses
     *     at once) - both are surfaced as distinct, separately addressable cache entries instead of
     *     one clobbering the other.
     * (b) If only a *single* address has ever been seen for a name and a new announcement for that
     *     name arrives with a different address, it is treated as an IP change (e.g. a DHCP lease
     *     reassignment) and the existing slot's address is updated in place, silently. This is a
     *     deliberate, optimistic heuristic: right for the common case, and even in the rare wrong
     *     case (a second, currently-offline device with the same name) it degrades gracefully - the
     *     second device takes over the first's slot until a session where both announce together,
     *     at which point rule (a) splits them apart again. No data is destroyed.
     *
     * A 'known-device' sourced announcement (built from persisted, possibly stale settings - see
     * `addKnownDevice()`) is never allowed to clobber an address we already have a live/real
     * ('mdns') observation for this session - that was the actual stale-IP bug: a later re-add of
     * known devices silently re-clobbering a cache entry a concurrent real mDNS announcement had
     * just corrected.
     */
    protected addService(service:MulticastDnsAnnouncement, source?:string):void {
        const src = source==='known-device' ? 'known-device' :  'mdns';

        try {
            service.transport = this.getName();

            // OpenBikeControl announces its service UUIDs in a different TXT record than Direct Connect
            if (service.type===OBC_TYPE && !service.serviceUUIDs?.length)
                service.serviceUUIDs = [OBC_SERVICE]

            // exact match (same name AND same address): a refresh/heartbeat of an entry we already
            // track, not a new device
            const sameAddress = this.findByNameAndAddress(service.name, service.address)
            if (sameAddress) {
                this.refreshSameAddressEntry(sameAddress, service, src, source)
                return
            }

            const sameName = this.findAllByName(service.name)

            // never let a stale known-device placeholder clobber a name we already have a live
            // observation for (at a different address)
            if (src==='known-device' && sameName.some( a=> a.source!=='known-device')) {
                return
            }

            if (sameName.length===0) {
                // first time we see this name this session
                this.announceNewEntry(service, src, source, 'device announced')
                return
            }

            const realEntries = sameName.filter( a=> a.source!=='known-device')

            if (src!=='known-device' && realEntries.length>=1) {
                // rule (a): a 2nd (or further) independently, really observed address for this name
                // this session - proof of a 2nd physical device sharing the same (generic) name
                this.announceNewEntry(service, src, source, 'device announced (name collision, distinct address)')
                return
            }

            // rule (b): exactly one entry on file for this name (a known-device placeholder, or an
            // earlier real observation) and no independent 2nd address has been seen this session -
            // treat this as the same physical device re-announcing under a new address, update the
            // slot in place, silently
            this.reannounceExistingEntry(sameName[0], service, src, source)
        }
        catch(err:any) {
            this.logError(err, 'addService')
        }

    }

    // Refreshes an entry we already track at this exact name+address (a heartbeat, not a new
    // device). A known-device placeholder that now gets confirmed by a real observation is
    // upgraded in place - see addService()'s doc comment for the source/placeholder rules.
    private refreshSameAddressEntry(sameAddress:Announcement, service:MulticastDnsAnnouncement, src:string, source?:string) {
        const idx = this.services.indexOf(sameAddress)
        const wasKnownDevicePlaceholder = sameAddress.source==='known-device'
        const nextSource = (wasKnownDevicePlaceholder && src!=='known-device') ? src : sameAddress.source

        // an announcement without services (e.g. from the unfiltered browser) must not replace one with services
        const hadServices = sameAddress.service.serviceUUIDs?.length>0
        const hasServices = service.serviceUUIDs?.length>0
        this.services[idx] = {ts:Date.now(),service: (hadServices && !hasServices) ? sameAddress.service : service,source:nextSource}

        if (src!=='known-device' && wasKnownDevicePlaceholder) {
            this.logEvent({message:'device re-announced',device:service.name, announcement:service, source})
            this.emitDevice(service)
        }
        else if (!hadServices && hasServices) {
            // first announcement with services (e.g. an OpenBikeControl device that was already seen by the unfiltered browser)
            this.logEvent({message:'device announced',device:service.name, announcement:service, source})
            this.emitDevice(service)
            this.matching?.push(service.name)
        }
    }

    // Records a brand new cache entry (first sighting of this name this session, or a 2nd distinct
    // address proving a 2nd physical device - see addService()'s doc comment, rules (a)).
    private announceNewEntry(service:MulticastDnsAnnouncement, src:string, source:string|undefined, message:string) {
        this.services.push( {ts:Date.now(),service,source:src} )
        if ( !service.serviceUUIDs?.length)
            return;

        // unverified placeholder: cached for waitForPeripheral(), but not announced
        if (src==='known-device')
            return;

        this.logEvent({message,device:service.name, announcement:service, source})
        this.emitDevice(service)
        this.matching?.push(service.name)
    }

    // Updates an existing entry in place under a new address - the "same device, address changed"
    // heuristic, rule (b) in addService()'s doc comment.
    private reannounceExistingEntry(existing:Announcement, service:MulticastDnsAnnouncement, src:string, source?:string) {
        const idx = this.services.indexOf(existing)
        this.services[idx] = {ts:Date.now(),service,source:src}

        if (src!=='known-device') {
            this.logEvent({message:'device re-announced',device:service.name, announcement:service, source})
            this.emitDevice(service)
        }
    }

    protected findByNameAndAddress(name:string,address:string) {
        return this.services.find( a=> a.service.name===name && a.service.address===address && a.ts>Date.now()-DC_EXPIRATION_TIMEOUT )
    }

    protected findAllByName(name:string) {
        return this.services.filter( a=> a.service.name===name && a.ts>Date.now()-DC_EXPIRATION_TIMEOUT )
    }

    protected getAll() {
        return this.services.filter( a=> a.ts>Date.now()-DC_EXPIRATION_TIMEOUT )
    }

    /**
     * Returns whether, within the current discovery session, more than one distinct address has
     * been observed for devices announcing under the given name.
     *
     * Used by consumers (see incyclist-services `DeviceConfigurationService.add()`) to tell a
     * genuine second physical device apart from a simple address change of an already-known device
     * sharing the same name. See FIXES_BACKLOG #14.
     */
    public hasNameCollision(name:string):boolean {
        return this.findAllByName(name).length>1
    }

    setDebug(enabled:boolean) {
        this.debug = enabled
    }


    public logEvent(event:any) {

        if (this.logDisabled && event.message!=='Error')    
            return;

        this.getLogger().logEvent(event)
        const emitPayload = {...event}
        delete emitPayload.ts


        this.emit('log',emitPayload)
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
    
        if (this.debug || w?.SERVICE_DEBUG || process.env.DEBUG) 
            console.log(`~~~ ${this.logger.getName().toUpperCase()}-SVC`, event)
    }


    public logError(err:Error, fn:string, args?) {
        const logInfo = args || {}

        this.logEvent({message:'Error', fn, ...logInfo, error:err.message, stack:err.stack})
    }

    protected getProtocol(announcement:MulticastDnsAnnouncement):BleProtocol {    
        const DeviceClasses = this.getAdapterFactory().getAllSupportedSensors()??[]

        const matching = DeviceClasses.filter(C=>  {
            const device = new C(null)

            return device.isMatching(announcement.serviceUUIDs)
        })

        let DeviceClass: typeof TBleSensor

        DeviceClass = this.getBestDeviceMatch( matching)
        const C = new DeviceClass(null)
        return C.getProtocol()
    }

    protected getBestDeviceMatch(DeviceClasses : (typeof TBleSensor)[]):typeof TBleSensor {
        if (!DeviceClasses||DeviceClasses.length===0)
            return;
        const details = DeviceClasses.map( c=> ( {name:c.prototype.constructor.name, priority:(c as any).detectionPriority||0,class:c } ))
        details.sort( (a,b) => b.priority-a.priority)
        
        return details[0].class
    }
    protected createAnnouncementFromSettings(settings: BleDeviceSettings): MulticastDnsAnnouncement {
        // OpenBikeControl devices don't use a fixed port, they can only be connected once announced
        if (settings.protocol && settings.address && settings.protocol!=='openbikecontrol') {
            const announcement:MulticastDnsAnnouncement = {
                name: settings.name,
                address: settings.address, 
                protocol: 'tcp',
                port: DC_PORT,
                type: DC_TYPE,
                transport: 'wifi',
                serviceUUIDs: this.getServiceUUIDs(settings),
            }

            return announcement
        }

            

    }

    protected getServiceUUIDs(settings: BleDeviceSettings):string[] { 

        if (settings.services && settings.services.length>0) {
            return settings.services.split(',').map(s=>s.trim())
        }

        switch (settings.protocol) {
            case 'fm':
                return ['1826']
            case 'hr':
                return ['180d']
            case 'wahoo':
                return [CSP,WAHOO_ADVANCED_FTMS]
            case 'cp':
                return [CSP]
            case 'csc':
                return [CSC]
            case 'zwift-play':
                return ['0000000119ca465186e5fa29dcdd09d1']
            default:
                return []
        }
    }



    protected getAdapterFactory() {
        return BleAdapterFactory.getInstance('wifi')
    }

}

export class DirectConnectInterfaceFactory extends InterfaceFactory {

    protected iface:DirectConnectInterface
    constructor() {
        super()
        this.iface = DirectConnectInterface.getInstance()
    }   

    public getInterface() {
        return this.iface
    }
}