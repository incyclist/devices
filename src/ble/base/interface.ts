import EventEmitter from "events";
import { DeviceSettings, InterfaceProps } from "../../types";
import { EventLogger } from "gd-eventlog";
import { BleBinding,  BleDeviceSettings,  BleInterfaceState,  BlePeripheralAnnouncement, BleRawPeripheral, BleScanProps,  IBlePeripheral  } from "../types";
import { IBleInterface } from '../../ble/types';
import { InteruptableTask, TaskState } from "../../utils/task";
import { BlePeripheral } from "./peripheral";
import { beautifyUUID, getPeripheralInfo, parseUUID } from "../utils";
import { InterfaceFactory } from "./types";
import { BleAdapterFactory } from "../factories";
import { TBleSensor } from "./sensor";

const BLE_EXPIRATION_TIMEOUT = 10*1000*60 // 10min
const BLE_DEFAULT_CONNECT_TIMEOUT = 30*1000; // 30s

let instanceCount = 0


interface Announcement {
    service: BlePeripheralAnnouncement
    ts: number
}

/**
 * Direct Connect Interface class.
 * 
 * This class provides an interface to detect devices in Direct Connect protocol.
 *
 * @class
 * @public 
 * 
 */

export class BleInterface   extends EventEmitter implements IBleInterface<BlePeripheralAnnouncement> { 

    protected static _instance:BleInterface
     /**
     * The name of the interface.
     */
    static readonly INTERFACE_NAME:string = 'ble'

    protected logger: EventLogger
    protected props: InterfaceProps
    protected logEnabled: boolean
    protected binding: BleBinding
    protected debug: boolean
    protected logDisabled: boolean
    protected internalEvents: EventEmitter
    protected services: Announcement[] = []
    protected incompleteServices: BlePeripheralAnnouncement[] = []
    protected unsupported: BlePeripheralAnnouncement[] = []
    protected expectedServices: string[] = ['180d','1818','1826','6e40fec1']
    protected matching: string[] = []

    protected connectTask: InteruptableTask<TaskState,boolean>
    protected scanTask: InteruptableTask<TaskState,void>
    protected discoverTask: InteruptableTask<TaskState,void>
    protected onDiscovered: (peripheral:BleRawPeripheral)=>void   
    protected instanceId: number
    protected connectedPeripherals: IBlePeripheral[] = []
    protected connectAttemptCnt:number = 0;

    static getInstance(props:InterfaceProps={}): BleInterface {
        if (BleInterface._instance===undefined)
            BleInterface._instance = new BleInterface(props)
        else {  
            BleInterface._instance.setProps(props)
            if ( props.binding) {
                BleInterface._instance.setBinding(props.binding)
            }
            if ( props.logger) {
                BleInterface._instance.logger = props.logger
            }
            if ( props.log && !BleInterface._instance.logger) { 
                BleInterface._instance.logger = new EventLogger( 'BLE');
            }
        }

        return BleInterface._instance
    }

    /**
     * Creates a new BleInterface instance.
     * @param {InterfaceProps} props - The properties of the interface.
     */
    protected constructor(props:InterfaceProps) {  
        super()

        this.instanceId = ++instanceCount

        this.props = props;       
        this.logEnabled = props.log||true

        const {binding} = props;

        this.setLogger(props.logger??new EventLogger( 'Ble'))
        if (binding) {
            this.setBinding(binding)

        }
        this.internalEvents = new EventEmitter()
        this.onDiscovered = this.onPeripheralFound.bind(this)

        const {enabled=true} = props
        if (this.binding && enabled)
            this.autoConnect()
    }

    setProps(props:InterfaceProps) {
        this.props = props
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
        return BleInterface.INTERFACE_NAME
    } 

    /**
     * Sets the binding for this instance
     * 
     * Bindings are used to allow providing functionality on different patforms, 
     * e.g. on Desktop(Electron), the binding will be using IPC between Web and Electron App
     *      on Mobile(React Native), the binding might require native code
     * @param {BleBinding} binding - The binding instance.
     */
    setBinding(binding: BleBinding): void {

        const prev=this.binding
        this.binding = binding

        if (!prev && !this.isConnected() && this.props.enabled) {        
            this.autoConnect()            
        }

    }

    /**
     * Gets the binding instance.
     * @returns {BleBinding} The binding instance.
     */
    getBinding() {
        return this.binding
    }

    protected autoConnect() {
        this.connect()
    }

    /**
     * Connects to the interface.
     * @param {boolean} [reconnect=false] - Whether the connection is originated from a reconnect
     * 
     * @returns {Promise<boolean>} Whether the connection was successful.
     */
    async connect(reconnect?:boolean): Promise<boolean> {
        if (!this.getBinding()) {
            this.logEvent({message:'BLE not available'})
            return false;
        }

        if (this.isConnecting()) {
            this.logEvent({message:'BLE connect - already connecting'})
            return this.connectTask.getPromise()
        }

        if (this.isConnected())
            return true

        this.logEvent({message:'BLE connect request'});

        this.connectTask = new InteruptableTask( this.connectBle(), {
            timeout:this.getConnectTimeout(),
            name:'BLE connect',
            errorOnTimeout:false,
            log: this.logEvent.bind(this),
        })

        const success = await  this.connectTask.run().catch(()=>false)
        if (success) {            
            this.startPeripheralScan()
        }

        return success;
    }


    /**
     * Disconnects from the interface and cleans up resources
     * @returns {Promise<boolean>} Whether the disconnection was successful.
     */
    async disconnect(connectionLost?:boolean): Promise<boolean> {
        if (!this.getBinding()) {
            return false;
        }

        if (!this.isConnected() && !connectionLost) return true
        
        if (!connectionLost)
            this.logEvent({message:'disconnect request'});

        this.emit('disconnect-request')
        // stop peripheral discovery
        await this.stopPeripheralScan()

        // disconnect all peripherals
        if (connectionLost) {
            this.emitDisconnectAllPeripherals()
        }
        else {
            await this.disconnectAllPeripherals()
        }

        // stop interface
        if (this.isConnecting())
            await this.connectTask?.stop()

        this.getBinding().removeAllListeners()
        this.connectAttemptCnt = 0

        this.emit('disconnect-done')
        return true        
    }

    /**
    * Checks if the interface is connected.
    * @returns {boolean} Whether the interface is connected.
    */
    isConnected(): boolean {
        return this.connectAttemptCnt>0 && this.getBinding()?.state === 'poweredOn'
    }

    registerConnected(peripheral: IBlePeripheral) {
        this.connectedPeripherals.push(peripheral)
    }

    protected isConnecting() {
        return this.connectTask?.isRunning()===true
    }


    /**
    * Scans for devices.
    * @param {BleScanProps} props - The scan properties.
    * 
    * @emits device   {DeviceSettings} a device that was found during the scan

    * @returns {Promise<DeviceSettings[]>} The list of device settings.
    */
    async scan(props: BleScanProps): Promise<DeviceSettings[]> {
        this.resumeLogging()

        if (this.isScanning()) {
            this.logEvent({message:'starting scan - already scanning'})
            return this.scanTask.getPromise()
                .then( ()=>{ return this.onScanDone()} )
                .catch( ()=>[])
        }
        this.logEvent({message:'starting scan ..', interface:'ble'})

        this.scanTask = new InteruptableTask( this.startScan(), {
            timeout:props.timeout,
            name:'scan',
            errorOnTimeout: false,
            log: this.logEvent.bind(this),            
        })

        try {
            await this.scanTask.run()

        }
        catch(err) {
            this.logError(err,'scan')
        }

        return this.onScanDone()



        
    }
    async stopScan(): Promise<boolean> {
        if (!this.isScanning()) return true;

        this.logEvent({message:'stopping scan ...', interface:'ble'})
        const res = await this.scanTask.stop()
        return (res===true)
    }

    onScanDone():DeviceSettings[] {
        this.logEvent({message:'scan stopped'})                
        delete this.scanTask
        return this.buildDeviceSettings(this.matching)
    }

    pauseLogging() {
        this.logEvent({message:'pausing logging'})
        this.logDisabled = true
        this.getBinding().pauseLogging()
    }


    resumeLogging() {
        this.getBinding().resumeLogging()
        this.logDisabled = false
        this.logEvent({message:'resuming logging'})
    }
    isLoggingPaused(): boolean {
        return this.logDisabled
    }

    createPeripheral(announcement: BlePeripheralAnnouncement): IBlePeripheral {
        return new BlePeripheral(announcement)
    }
    createPeripheralFromSettings(settings: DeviceSettings): IBlePeripheral {
        const info = this.getAll().find(a=>a.service.name === settings.name)

        if (!info?.service)
            return null;
        return this.createPeripheral(info.service)
    }

    waitForPeripheral(settings:DeviceSettings): Promise<IBlePeripheral> {
        
        const peripheral =  this.createPeripheralFromSettings(settings)
        if (peripheral) return Promise.resolve(peripheral)

        

        return new Promise ( (done)=>{

            const wasDiscovering = this.isDiscovering()
            if (!wasDiscovering)
                this.startPeripheralScan()

            const onDevice = (device:DeviceSettings)=>{

                if (device.name===settings.name) {
                    const peripheral =  this.createPeripheralFromSettings(settings)

                    if (peripheral) {
                        this.off('device', onDevice)
                        if (!wasDiscovering)
                            this.stopPeripheralScan()
                        done(peripheral)
                    }
                }                        
            }

            this.on('device', onDevice)
        })
            

    }


    createDeviceSetting(service:BlePeripheralAnnouncement):BleDeviceSettings {
        const {peripheral} = service

        // I found some scans (on Mac) where address was not set
        if (peripheral.address===undefined || peripheral.address==='')
            peripheral.address = peripheral.id || peripheral.name;
        
        const protocol = this.getAdapterFactory().getProtocol(service.serviceUUIDs)
        const {id,name,address} = getPeripheralInfo(peripheral)
        
        return {interface:BleInterface.INTERFACE_NAME, protocol, id,name,address}
    }


    protected async reconnect() {
        await this.disconnect()
        await this.connect(true)
    }

    protected async startPeripheralScan(retry:boolean=false):Promise<void> {
        this.expectedServices = this.getExpectedServices()
        
        if (!retry)
            this.logEvent({message:'starting peripheral discovery ...'})
        
        if (!this.isConnected() || this.isDiscovering())  {
            return;
        }

        this.discoverTask = new InteruptableTask( this.discoverPeripherals(), {
            errorOnTimeout: false,
            //timeout: 20000,
            name:'discover',
            log: this.logEvent.bind(this),
        })

        try {
            await this.discoverTask.run()
        }
        catch(err) {
            this.logError(err,'discover')
        }

        // scan should always run unless explicitly stopped
        if (this.discoverTask.getState().result !== 'stopped' ) {
            this.startPeripheralScan(true)
        }

    }

    protected stopPeripheralScan():Promise<void> {
        if (!this.isConnected() || !this.isDiscovering())
            return;

        this.logEvent({message:'stopping peripheral discovery ...'})

        this.discoverTask.stop()
        

        const ble = this.getBinding()
        ble.off('discover',this.onDiscovered )

        return new Promise( done =>{            
            ble.stopScanning( ()=>{
                done()
            })       
        })
    }

    protected emitDisconnectAllPeripherals() {
        this.connectedPeripherals.forEach( p=> {
            const peripheral = (p as BlePeripheral).getPeripheral()
            peripheral.emit('disconnect')
        })       
        this.connectedPeripherals = []    
    }

    protected async disconnectAllPeripherals():Promise<void> {
        const promises = this.connectedPeripherals.map( p=> p.disconnect())
        await Promise.allSettled(promises)
        this.connectedPeripherals = []    
    }


    protected isDiscovering() {
        return this.discoverTask?.isRunning()===true
    }

    protected discoverPeripherals():Promise<void> {        

        return new Promise( done =>{
            const ble = this.getBinding()
            

            ble.startScanning([], true,(err)=>{
                if(err) {
                    this.logEvent({message:'start scanning error',error:err.message})
                    ble.stopScanning( ()=>{
                        done()    
                    })
                }
                else  {
                    ble.on('discover',this.onDiscovered )
                    ble.on('error',(err)=>{
                        this.logEvent({message:'error during discovery',error:err.message})
                    })
            
                }
            })    
        })        
    }

    /*

    pauseDiscovery():Promise<void> {
        this.getBinding().off('discover',this.onDiscovered)
        return new Promise<void>( done =>{
            try {
                
                this.getBinding().stopScanning()
                done()
                
            }
            catch(err) {
                done()
            }
        })
    }
    resumeDiscovery():Promise<void> {
        return this.discoverPeripherals()
    }

    */

    protected onPeripheralFound(peripheral:BleRawPeripheral) {
        if (!this.isConnected() || !this.isDiscovering())
            return;

        const announcement = this.buildAnnouncement(peripheral)

        if (!announcement.name || this.isKnownUnsupported(announcement)) {
            return;            
        }

        const device = {...announcement}
        delete device.peripheral

        if (this.find(announcement)) {
            return
        }

        // some devices (especially Tacx) don't advertise their supported services
        // we need to request them explicitely from the device
        // this is currently deactivated, assuming that upon re-advertisement at some point the services would be announced
        if (announcement.serviceUUIDs.length === 0){               
            return 
        }

        // wahoo has a special enhancement, which is not advertised
        // we need to explcitly check if this peripheral has this enhancement
        // to do so, we need to stop the scan, request the services and restart scan
        const isWahoo = this.checkForWahooEnhancement(announcement)
        if (isWahoo) {
            this.processWahooAnnouncement(announcement)
            return
        }

        this.addService(announcement)
    }

    protected checkForWahooEnhancement(announcement:BlePeripheralAnnouncement):boolean {

        if (announcement.name.includes('KICKR')) {
            const supported = announcement.serviceUUIDs.map( s=> beautifyUUID(s))
            if (supported.length===1 && supported[0]==='1818')
                return true
            
        }
        return false
    }

    protected processWahooAnnouncement(announcement:BlePeripheralAnnouncement) {

        if (this.isCompleting(announcement)) {
            return  
        }
    
        this.updateWithServices(announcement)
        .then( ()=>{
            if (this.isSupportedPeripheral(announcement))
                this.addService(announcement)

        })

        
    }


    protected buildAnnouncement(peripheral:BleRawPeripheral):BlePeripheralAnnouncement {
        return {
            advertisement:peripheral.advertisement,
            name:peripheral.advertisement.localName,
            serviceUUIDs:peripheral.advertisement.serviceUuids??[],
            peripheral,
            transport: this.getName()
        }
    }
    protected async updateWithServices(announcement:BlePeripheralAnnouncement):Promise<BlePeripheralAnnouncement> {
        if (!this.isConnected() || !this.isDiscovering())
            return;

        this.addCompleting(announcement)
        this.logEvent({message:'updateWithServices',peripheral:announcement.name})

        try {
            announcement.serviceUUIDs = await this.discoverServices(announcement)
            
        }
        catch(err) {
            this.logError(err,'updateWithServices')
        }


        this.removeCompleting(announcement)
        
    }

    protected async discoverServices(announcement:BlePeripheralAnnouncement):Promise<string[]> {
        const device = {...announcement}
        delete device.peripheral
        
        const {peripheral} = announcement
        
        try {

            peripheral.on('error',(err:Error)=>{ 
                peripheral.removeAllListeners()
                
                this.logEvent({message:'peripheral error',error:err.message})
            })
            peripheral.on('disconnect',()=>{ 
                peripheral.removeAllListeners()
                
                this.logEvent({message:'peripheral disconnected'})
                
            })


            await peripheral.connectAsync()

            if ( peripheral.discoverServicesAsync!==undefined) {
                const services = await peripheral.discoverServicesAsync([]) 
                announcement.serviceUUIDs = services.map(s=>s.uuid)   
            }
            else {
                const res = await peripheral.discoverSomeServicesAndCharacteristicsAsync([],[])                
                announcement.serviceUUIDs = res.services.map(s=>s.uuid)
            }


            
            
        }
        catch(err) {
            this.logEvent({message:'discover services failed',reason:err.message,device})       
        } 


        peripheral?.removeAllListeners()

        return announcement.serviceUUIDs
    }


    protected isScanning() {
        return this.scanTask?.isRunning()===true
    }

    protected startScan() {

        this.logEvent({message:'scan started',scanning:this.isScanning()})   
        this.emitCachedDevices();

        return  new Promise( ()=>{
            //  wait indefinitely (until stopped)
        })        

    }

    private emitCachedDevices() {
        const announced = this.getAll();
        this.matching = announced.map(a => a.service.name);

        announced.forEach(a => {
            this.emitDevice(a.service);
        });
    }

    protected emitDevice(service:BlePeripheralAnnouncement) {
        const settings = this.createDeviceSetting(service)
        this.logEvent({message:'device found',settings})
        this.emit('device',settings,service)
    }


    protected buildDeviceSettings(matching:string[]=[]) {

        return matching.map( (name)=> {
            const announcement = this.services.find(s=>s.service.name===name)
            return this.createDeviceSetting(announcement.service)
        })
    }


    protected addCompleting(service:BlePeripheralAnnouncement):void { 

        const existing = this.incompleteServices.find(s => s.name === service.name)
        if (existing)  {
            const idx = this.incompleteServices.indexOf(existing)
            this.incompleteServices[idx]= service
        }
        else {
            this.incompleteServices.push(service)
        }
    }

    protected addUnsupported(service:BlePeripheralAnnouncement):void {

        const existing = this.unsupported.find(s => s.name === service.name)
        if (existing)  {
            const idx = this.unsupported.indexOf(existing)
            this.unsupported[idx]= service  
        }
        else {
            this.unsupported.push(service)
        }   
    }

    protected isKnownUnsupported(service:BlePeripheralAnnouncement):boolean {
        return this.unsupported.find(s => s.name === service.name) !== undefined
    }
    protected removeCompleting(service:BlePeripheralAnnouncement):void { 
        const existingIdx = this.incompleteServices.findIndex(s => s.name === service.name)
        if (existingIdx !== -1) { 
            this.incompleteServices.splice(existingIdx,1)            
        }
    }


    protected isCompleting(service:BlePeripheralAnnouncement):boolean {
        return this.incompleteServices.find(s => s.name === service.name) !== undefined
    }



    protected addService(service:BlePeripheralAnnouncement):void {

        try {

            const isSuported = this.isSupportedPeripheral(service)
            if (!isSuported) {
                return;
            }

            const existing = this.find(service)
            if (existing)  {
                const idx = this.services.indexOf(existing)
                this.services[idx]= {ts:Date.now(),service}
            }
            else {
                const device = {...service}
                delete device.peripheral
                this.logEvent({message:'device announced', device})

                this.matching.push(service.name)
                this.services.push( {ts:Date.now(),service})
                this.emitDevice(service)
            }
        }
        catch(err) {
            this.logError(err, 'addService')
        }
        
    }

    protected isSupportedPeripheral(service:BlePeripheralAnnouncement):boolean {
        
        if (!service.serviceUUIDs?.length || service.name===undefined)
            return false

        const found = service.serviceUUIDs.map(parseUUID)
        const expected = this.expectedServices.map(parseUUID)

        const supported = found.filter( uuid => expected.includes(uuid) )??[]

        if (!supported.length) {
            this.logEvent({message:'peripheral not supported', name:service.name, uuids:service.serviceUUIDs})
            this.addUnsupported(service)
        }

        return supported.length > 0

    }

    protected find(service:BlePeripheralAnnouncement) {
        return  this.services.find( a=> a.service.name===service.name && a.ts>Date.now()-BLE_EXPIRATION_TIMEOUT )
    }
    protected getAll() {
        return this.services.filter( a=> a.ts>Date.now()-BLE_EXPIRATION_TIMEOUT )
    }

    setDebug(enabled:boolean) {
        this.debug = enabled
    }


    protected async connectBle():Promise<boolean> {
        this.connectAttemptCnt++;

        const state = this.getBinding().state
        if(state === 'poweredOn' ) {
            this.logEvent({message:'BLE connected'})
            return true;
        }
        const res = await this.waitForBleConnected()

        return res
    }

    protected waitForBleConnected():Promise<boolean> {
        return new Promise<boolean>( (done)=>{

            this.getBinding().once('error', (err) => {                        
                this.logEvent({message:'Ble connect result: error', error:err.message});
                return done(false)
            })

            this.getBinding().on('stateChange', (state:BleInterfaceState) => {
                if(state === 'poweredOn'){
                    this.onConnected();
                    return done(true);
                }  
                else {
                    this.logEvent({message:'BLE state change', state});
                }

            })
    
        })
    }

    protected onError(err:Error) {
        this.logError(err,'BLE connect')
    }

    protected onConnected() {
        this.logEvent({ message: 'BLE connected' });

        this.getBinding().removeAllListeners('error');
        this.getBinding().removeAllListeners('stateChange');
        this.getBinding().on('stateChange', this.onBleStateChange.bind(this));
        this.getBinding().on('error', this.onError.bind(this));
    }
    protected async onDisconnected() {
        this.logEvent({ message: 'BLE Disconnected' });

        // cleanup internal state and terminate ongoing activities
        await this.disconnect(true)

        // start listening for state changes and errors
        this.getBinding().on('stateChange', this.onBleStateChange.bind(this));
        this.getBinding().on('error', this.onError.bind(this));
    }

    protected onBleStateChange(state:BleInterfaceState) {
        if (state!=='poweredOn') {
            this.onDisconnected()
        }
        else 
            this.onConnected()        
    }

    protected getAdapterFactory():BleAdapterFactory<TBleSensor> {
        return BleAdapterFactory.getInstance('ble')
    }

    protected getConnectTimeout():number {
        return BLE_DEFAULT_CONNECT_TIMEOUT
    }

    protected getExpectedServices(): string[] {
        return this.getAdapterFactory().getAllSupportedServices();
    }



    public logEvent(event) {

        if (this.logDisabled && event.message!=='Error')    
            return;

        this.getLogger().logEvent({...event, interface:'ble'})
        const emitPayload = {...event}
        delete emitPayload.ts


        this.emit('log',emitPayload)
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
    
        if (this.debug || w?.SERVICE_DEBUG || process.env.DEBUG) 
            console.log(`~~~ ${this.logger.getName().toUpperCase()}-SVC`, {...event, interface:'ble'})
    }


    public logError(err:Error, fn:string, args?) {
        const logInfo = args || {}

        this.logEvent({message:'Error', fn, ...logInfo, error:err.message, stack:err.stack})
    }




}



export class BleInterfaceFactory extends InterfaceFactory{

    protected iface:BleInterface
    constructor() {
        super()
        this.iface = BleInterface.getInstance()
    }   

    public getInterface() {
        return this.iface
    }
}