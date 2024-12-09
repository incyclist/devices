
import IncyclistDevice from "../../base/adpater";
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties, IBleInterface, IBleSensor } from "../types";
import { IAdapter,IncyclistBikeData,IncyclistAdapterData,DeviceProperties, IncyclistInterface} from "../../types";
import { BleDeviceData } from "./types";
import { LegacyProfile } from "../../antv2/types";
import ICyclingMode from "../../modes/types";
import { BleInterfaceFactory } from "../factories/interface-factory";


export default class BleAdapter<TDeviceData extends BleDeviceData, TDevice extends IBleSensor>  extends IncyclistDevice<BleDeviceProperties>  { 

    protected deviceData: TDeviceData
    protected data: IncyclistAdapterData
    protected dataMsgCount: number
    protected lastDataTS: number;
    protected device: TDevice
    protected onDeviceDataHandler = this.onDeviceData.bind(this)

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props)


        this.deviceData = {} as TDeviceData
        this.data = {}
        this.dataMsgCount = 0;
        this.updateFrequency = 1000;

    }

    getUniqueName(): string {
        const settings:BleDeviceSettings = this.settings as BleDeviceSettings

        if (settings.name?.match(/[0-9]/g) || settings.address===undefined)      
            return this.getName()
        else {
            const addressHash = settings.address.substring(0,2) + settings.address.slice(-2)
            return `${this.getName()} ${addressHash}`
        }
    }

    async connect():Promise<boolean> { 
        const iface = BleInterfaceFactory.createInstane( this.getInterface() )
        return await iface.connect()
    }

    getPeripheral() {
        const iface = BleInterfaceFactory.createInstane( this.getInterface() ) as unknown as IBleInterface<any>
        const p =  iface.createPeripheralFromSettings(this.settings)
        console.log('~~~ Peripheral',p, this.settings)
        return p
    }


    async close():Promise<boolean> { 
        return true
    
    }

    getComms():TDevice {        
        return this.device
    }


    isEqual(settings: BleDeviceSettings): boolean {
        const as = this.settings as BleDeviceSettings;

        if (as.interface!==settings.interface)
            return false;

        if (as.profile || settings.profile)  { // legacy
            return (as.protocol===settings.protocol && as.profile===settings.profile && as.name===settings.name)
        }
        else {
            return (as.protocol===settings.protocol && (
                (as.name && settings.name && as.name===settings.name) || 
                (as.address && settings.address && as.address===settings.address) || 
                (as.id && settings.id && as.id===settings.id))  ) 
        }

    }
    isSame( adapter: IAdapter):boolean {
        return this.isEqual( adapter.getSettings() as BleDeviceSettings)
    }

    isConnected():boolean {
        return this.device?.isConnected()
    }

    resetData() {
        this.dataMsgCount = 0;        
        this.deviceData = {} as TDeviceData
        this.data= {}
        this.lastDataTS = undefined
    }

    getInterface(): string {
        const iface = this.settings.interface
        if (typeof iface === 'string')
            return this.settings.interface as string
        else {
            const i = this.settings.interface as unknown as IncyclistInterface
            return i.getName()
        }
    }

    getProfile():LegacyProfile {
        const C = this.constructor as typeof BleAdapter<TDeviceData,TDevice>
        return C['INCYCLIST_PROFILE_NAME']
    }

    getProtocolName():string {
        const settings = this.settings as BleDeviceSettings
        return settings.protocol
    }

    getID():string {
        const settings:BleDeviceSettings = this.settings as BleDeviceSettings

        return settings.id || settings.address
    }

    getName(): string {
        const settings = this.settings as BleDeviceSettings
        return settings.name || settings.id || settings.address
    }

    refreshDeviceData()     {
        if ( this.isStopped() || this.isPaused())
            return;   

        try {
            this.logEvent( {message:'refreshDeviceData',data:this.deviceData, isControllable:this.isControllable()})        
        
            if (this.isControllable()) {
                
                // transform data into internal structure of Cycling Modes
                const mappedData = this.mapData(this.deviceData) as IncyclistBikeData       
                
                // let cycling mode process the data
                const incyclistData = this.getCyclingMode().updateData(mappedData);                               

                // transform data into structure expected by the application
                this.data =  this.transformData(incyclistData);                  
            }
            else {
                this.data =  this.mapData(this.deviceData)
            }
            this.emitData(this.data)
        }
        catch(err) {
            this.logEvent({message:'error', fn:'refreshDeviceData', error:err.message, stack:err.stack})
        }


    }

    onDeviceData(deviceData:TDeviceData) {
        try {
            this.dataMsgCount++;
            this.lastDataTS = Date.now();
    
            this.deviceData = Object.assign( {},deviceData);        
        
            if (!this.canEmitData())
                return;       
    
            this.logEvent( {message:'onDeviceData',data:deviceData, isControllable:this.isControllable()})        
    
            if (this.isControllable()) {
                
                // transform data into internal structure of Cycling Modes
                const mappedData = this.mapData(deviceData) as IncyclistBikeData       
                
                // let cycling mode process the data
                const incyclistData = this.getCyclingMode().updateData(mappedData);                               
    
                // transform data into structure expected by the application
                this.data =  this.transformData(incyclistData);                  
            }
            else {
                this.data =  this.mapData(this.deviceData)
            }
            this.emitData(this.data)
    
        }
        catch(err) {
            this.logEvent({message:'Error',fn:'onDeviceData', error:err.message,stack:err.stack})
        }
   
    }

    // istanbul ignore next
    mapData(deviceData:TDeviceData):IncyclistAdapterData|IncyclistBikeData {
        throw new Error('message not implemented')    
    }

    // istanbul ignore next
    transformData( data:IncyclistBikeData): IncyclistAdapterData {
        throw new Error('message not implemented')    
    }

    

    getSettings(): BleDeviceSettings {
        return this.settings as BleDeviceSettings
    }
    setProperties(props:BleDeviceProperties) {
        this.props = props
    }

    check(): Promise<boolean> {
        return this.start( {scanOnly:true })    
    }


    async startPreChecks(props:BleStartProperties):Promise< 'done' | 'connected' | 'connection-failed' > {
        const wasPaused = this.paused 
        const wasStopped = this.stopped;
       
        this.stopped = false;
        if (wasPaused)
            this.resume()

        if (this.started && !wasPaused && !wasStopped) {
            return 'done';
        }
        if (this.started && wasPaused ) { 
            return 'done';
        }
       
        const connected = await this.connect()
        if (!connected)
            return 'connection-failed'

        return 'connected'
    }


    async start( startProps?: BleStartProperties ): Promise<boolean> {

        const props = this.getStartProps(startProps)

        const preCheckResult = await this.startPreChecks(props)
        if (preCheckResult==='done')
            return this.started

        if (preCheckResult==='connection-failed')
            throw new Error(`could not start device, reason:could not connect`)
        
        this.logEvent( {message:'starting device', device:this.getName(), props, isStarted: this.started})


        try {

            const connected = await this.startSensor();

            if (connected) {
                this.logEvent({ message: 'peripheral connected', device:this.getName(),props });                                
            }
            else {
                this.logEvent({ message: 'peripheral connection failed', device:this.getName(), reason:'unknown', props });    
            }

            return true;
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, protocol:this.getProtocolName()})
            return false
        }
    }

    async startSensor():Promise<boolean> {
        const connected = await this.getComms().startSensor()
        if(connected)
            this.getComms().on('data',this.onDeviceDataHandler) 
        return connected
    }

    async stop(): Promise<boolean> { 
        this.logEvent( {message:'stopping device', device:this.getName()})
        
        let reason:string = 'unknown';
        let stopped = false
        this.device.reset();
        try {

            stopped = await this.getComms().stopSensor();
        }
        catch(err) {    
            reason = err.message;
        }
        if (stopped) {
            this.logEvent( {message:'device stopped', device:this.getName()})    
        }
        else {
            this.logEvent( {message:'stopping device failed', device:this.getName(), reason})    
        }

        return stopped        
    }


    update(): void {
        // not required for BLE
    }

    setCyclingMode(mode: string | ICyclingMode, settings?: any, sendInitCommands?: boolean): void { 
        super.setCyclingMode(mode,settings,sendInitCommands);

        // recalculate speed based on latest data
        this.refreshDeviceData()
    }



}

