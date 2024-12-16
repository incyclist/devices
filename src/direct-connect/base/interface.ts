import EventEmitter from "events";
import { DeviceSettings, InterfaceProps } from "../../types";
import { EventLogger } from "gd-eventlog";
import { DirectConnectBinding, MulticastDnsAnnouncement } from "../bindings";
import { DirectConnectScanProps } from "../types";
import { BleDeviceSettings, BleProtocol, IBleInterface, IBlePeripheral } from '../../ble/types';
import { InteruptableTask,  TaskState } from "../../utils/task";
import { DirectConnectPeripheral } from "./peripheral";
import { BleAdapterFactory } from "../../ble";
import { TBleSensor } from "../../ble/base/sensor";
import { ResponseTimeout } from "../../serial/daum/types";
import { InterfaceFactory } from "../../ble/base/types";

const DC_TYPE = 'wahoo-fitness-tnp'
const DC_EXPIRATION_TIMEOUT = 10*1000*60 // 10min


interface Announcement {
    service: MulticastDnsAnnouncement,
    ts: number
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
    protected scanTask: InteruptableTask<TaskState,DeviceSettings[]>;
    protected matching?:Array<string> = []
    protected instance:number

    static getInstance(props:InterfaceProps={}): DirectConnectInterface {
        if (DirectConnectInterface._instance===undefined)
            DirectConnectInterface._instance = new DirectConnectInterface(props)

        else {  
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

        this.autoConnect()
    }
    createPeripheral(announcement: MulticastDnsAnnouncement): IBlePeripheral {
        return DirectConnectPeripheral.create(announcement) 
    }

    createDeviceSetting(service:MulticastDnsAnnouncement):BleDeviceSettings {
        const name = service.name
        const protocol = this.getProtocol(service)

        return {interface:DirectConnectInterface.INTERFACE_NAME, name, protocol}
    }
    createPeripheralFromSettings(settings: DeviceSettings): IBlePeripheral {
        const info = this.getAll().find(a=>a.service.name === settings.name)

        if (!info?.service)
            return null;
        return this.createPeripheral(info.service)
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
        this.binding = binding
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
        try {
            if (!this.getBinding()?.mdns) {
                this.logEvent({message:'Direct Connect not available'})
                return false;
            }
            this.getBinding().mdns.connect()

            if (!reconnect)
                this.logEvent({message:'starting multicast DNS scan ..'})

            
            this.getBinding().mdns.find( {type:DC_TYPE},( service:MulticastDnsAnnouncement )=>{
                this.addService( service )  

            } )
        }
        catch (err) {
            this.logError(err, 'connect')
        }
        return true;

    }

    /**
     * Disconnects from the interface and cleans up resources
     * @returns {Promise<boolean>} Whether the disconnection was successful.
     */
    async disconnect(): Promise<boolean> {
        await this.stopScan()
        this.getBinding()?.mdns?.disconnect()
        this.internalEvents.removeAllListeners()
        return this.getBinding()?.mdns!==undefined && this.binding.mdns!==null
    }

    /**
    * Checks if the interface is connected.
    * @returns {boolean} Whether the interface is connected.
    */
    isConnected(): boolean {
        return this.getBinding()?.mdns!==undefined && this.binding.mdns!==null
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
            await this.scanTask.getPromise()
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
        if (!this.isScanning()) return Promise.resolve(true);

        this.logEvent({message:'stopping scan ...'})
        const res = await this.scanTask.stop()
        delete this.scanTask
        return res
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

    waitForPeripheral(settings:DeviceSettings): Promise<IBlePeripheral> {

        const peripheral =  this.createPeripheralFromSettings(settings)
        if (peripheral) return Promise.resolve(peripheral)

        return new Promise ( (done)=>{

            const onDevice = (device:BleDeviceSettings)=>{

                if (device.name===settings.name) {
                    const peripheral =  this.createPeripheralFromSettings(settings)
                    if (peripheral) {
                        this.off('device', onDevice)
                        done(peripheral)
                    }
                }                        
            }

            this.on('device', onDevice)
        })
            

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

        announced.forEach(a => {
            this.emitDevice(a.service);
        });
    }

    protected emitDevice(service:MulticastDnsAnnouncement) {
        this.emit('device',this.createDeviceSetting(service),service)
    }


    protected buildDeviceSettings(matching:string[]=[]) {

        return matching.map( (name)=> ({interface:DirectConnectInterface.INTERFACE_NAME, name}) )
    }



    protected addService(service:MulticastDnsAnnouncement):void {
        try {
            service.transport = this.getName();
            
            const existing = this.find(service)
            if (existing)  {
                const idx = this.services.indexOf(existing)
                this.services[idx]= {ts:Date.now(),service}
            }
            else {
                this.logEvent({message:'device announced',device:service.name, announcement:service})
                
                this.services.push( {ts:Date.now(),service})
               
                this.emitDevice(service)                    
                this.matching?.push(service.name)
                
                

                
            }
        }
        catch(err) {
            this.logError(err, 'addService')
        }
        
    }

    protected find(service:MulticastDnsAnnouncement) {
        return this.services.find( a=> a.service.name===service.name && a.ts>Date.now()-DC_EXPIRATION_TIMEOUT )
    }
    protected getAll() {
        return this.services.filter( a=> a.ts>Date.now()-DC_EXPIRATION_TIMEOUT )
    }

    setDebug(enabled:boolean) {
        this.debug = enabled
    }


    public logEvent(event) {

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