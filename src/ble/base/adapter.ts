
import IncyclistDevice from "../../base/adpater";
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties, IBleInterface, IBlePeripheral, IBleSensor } from "../types";
import { IAdapter,IncyclistBikeData,IncyclistAdapterData,DeviceProperties, IncyclistInterface, IncyclistCapability} from "../../types";
import { BleDeviceData } from "./types";
import { LegacyProfile } from "../../antv2/types";
import ICyclingMode from "../../modes/types";
import { BleMultiTransportInterfaceFactory } from "../factories/interface-factory";
import { InteruptableTask, TaskState } from "../../utils/task";
import { TBleSensor } from "./sensor";
import { resolveNextTick } from "../../utils/utils";


export default class BleAdapter<TDeviceData extends BleDeviceData, TDevice extends TBleSensor>  extends IncyclistDevice<BleDeviceProperties>  { 

    protected deviceData: TDeviceData
    protected data: IncyclistAdapterData
    protected dataMsgCount: number
    protected lastDataTS: number;
    protected device: TDevice
    protected onDeviceDataHandler = this.onDeviceData.bind(this)
    protected startTask: InteruptableTask<TaskState,boolean>;
    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props)


        this.deviceData = {} as TDeviceData
        this.data = {}
        this.dataMsgCount = 0;
        this.updateFrequency = 1000;

    }

    getUniqueName(): string {
        const settings:BleDeviceSettings = this.settings as BleDeviceSettings

        if (settings.name?.match(/\d/g) || settings.address===undefined)      
            return this.getName()
        else {
            const addressHash = settings.address.substring(0,2) + settings.address.slice(-2)
            return `${this.getName()} ${addressHash}`
        }
    }

    async connect():Promise<boolean> { 
        const iface = BleMultiTransportInterfaceFactory.createInstance( this.getInterface() )
        return await iface.connect()
    }

    getPeripheral() {
        const iface = BleMultiTransportInterfaceFactory.createInstance( this.getInterface() ) as unknown as IBleInterface<any>
        const p =  iface?.createPeripheralFromSettings(this.settings)
        return p
    }

    async waitForPeripheral() {
        this.logEvent({message:'waiting for sensor ...'})
        const iface = BleMultiTransportInterfaceFactory.createInstance( this.getInterface() ) as unknown as IBleInterface<any>
        const peripheral = await  iface.waitForPeripheral(this.settings)

        this.updateSensor(peripheral)
        
    }

    updateSensor(peripheral:IBlePeripheral) {
        throw new Error('method not implemented')
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
    
            this.deviceData = {...deviceData} ;        
        
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

    /* istanbul ignore next */
    getDefaultStartupTimeout():number {
        return 30000 // 30s
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

        if (this.isStarting()) {
            await this.stop()
        }

        this.startTask = new InteruptableTask( this.startAdapter(startProps), {
            timeout: startProps?.timeout,
            name:'start',
            errorOnTimeout: false,
            log: this.logEvent.bind(this)
        })

        const res = await this.startTask.run()
        return res;
    }

    protected isStarting():boolean {
        return this.startTask?.isRunning()
    }

    protected hasData() {
        return this.dataMsgCount>0
    }

    protected async waitForInitialData(startupTimeout):Promise<void> {

        let waitTask;
        let iv;

        const wait = ():Promise<boolean> =>{
            const res = new Promise<boolean>( (resolve) => {
    
                iv = setInterval( ()=> { 
                    if (this.hasData()) {
                        //this.logEvent({message:'has Data',data:this.deviceData})
                        clearInterval(iv)
                        resolve(true)
                    }
                    else if ( !this.isStarting() || !waitTask?.isRunning) {
                        resolve(false)
                        clearInterval(iv)
                    }
                }, 10)    
            })    

            return res            
        }

        waitTask = new InteruptableTask( wait(), {
            errorOnTimeout:false,
            timeout:startupTimeout
        })

        this.logEvent({ message: 'wait for sensor data', device:this.getName() });
        const hasData = await waitTask.run();       
        clearInterval(iv)

        if (hasData)
            this.logEvent({ message: 'sensor data received', device:this.getName() });
    }

    protected checkCapabilities() {
        // to be implemeted by controllable adapters
    }

    protected async initControl(_props?:BleStartProperties) {        
        // to be implemeted by controllable adapters
    }

    protected async startAdapter( startProps?: BleStartProperties ): Promise<boolean> {

        const props = this.getStartProps(startProps)
        const {timeout=this.getDefaultStartupTimeout()} = startProps
        const wasPaused = this.paused

        const preCheckResult = await this.startPreChecks(props)
        if (preCheckResult==='done') {
            await resolveNextTick()
            return this.started
        }

        if (preCheckResult==='connection-failed') {            
            this.logEvent({message: 'start result: error', error: 'could not start device, reason:could not connect', protocol:this.getProtocolName()})
            await resolveNextTick()
            return false
        }
        
        this.logEvent( {message:'starting device', device:this.getName(), props, isStarted: this.started})


        try {

            const connected = await this.startSensor();
            if (connected) {
                this.logEvent({ message: 'peripheral connected', device:this.getName(),props });                                
            }
            else {
                this.logEvent({ message: 'peripheral connection failed', device:this.getName(), reason:'unknown', props });    
                return false
            }

            await this.waitForInitialData(timeout)
            await this.checkCapabilities()        
            if ( this.hasCapability( IncyclistCapability.Control ) )
                await this.initControl(startProps)
                   
            this.resetData();      

            this.stopped = false;    
            this.started = true;

            if (wasPaused)
                this.resume()                

            return true;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message, protocol:this.getProtocolName()})
            return false
        }
    }

    async startSensor():Promise<boolean> {
        if (!this.getComms()?.hasPeripheral()) {
            await this.waitForPeripheral()
        }
        if (!this.getComms()) {
            return false
        }
        const connected = await this.getComms().startSensor()
        if(connected) {
            this.getComms().on('data',this.onDeviceDataHandler) 
            this.getComms().on('disconnected', this.emit.bind(this))
            this.getComms().on('error',console.log) 
        }
        return connected
    }

    async stop(): Promise<boolean> { 
        this.logEvent( {message:'stopping device', device:this.getName()})

        if (this.isStarting()) {
            await this.startTask.stop()
        }
        
        let reason:string = 'unknown';
        let stopped = false
        if (!this.getComms()) {
            this.logEvent( {message:'device stopped - not started yet', device:this.getName()})    
            return true;
        }
        this.getComms().reset();
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
        
        this.started = false
        this.stopped = true
        return stopped        
    }

    async pause(): Promise<boolean> {
        const res = await super.pause()

        const iface = BleMultiTransportInterfaceFactory.createInstance( this.getInterface() )
        iface.pauseLogging()

        return res;
    }

    async resume(): Promise<boolean> {

        const iface = BleMultiTransportInterfaceFactory.createInstance( this.getInterface() )
        iface.resumeLogging()

        const res = await super.resume()
        return res;
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

