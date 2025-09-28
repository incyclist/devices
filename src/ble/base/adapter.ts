
import IncyclistDevice from "../../base/adpater";
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties, IBleInterface, IBlePeripheral } from "../types";
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
            const addressHash = settings.id?.slice(-4)?.toUpperCase() ?? (settings.address?.substring(0,2)??'') + (settings.address?.slice(-2)??'')
            return `${this.getName()} ${addressHash}`
        }
    }

    async connect():Promise<boolean> { 
        const ble = this.getBle()
        return await ble.connect()
    }

    getPeripheral() {
        const ble = this.getBle() 
        const p =  ble?.createPeripheralFromSettings(this.settings)
        return p
    }

    async waitForPeripheral() {
        this.logEvent({message:'waiting for sensor ...',device:this.getName(),interface:this.getInterface()})
        const ble = this.getBle()
        const peripheral = await  ble.waitForPeripheral(this.settings)
        

        this.updateSensor(peripheral)
        this.updateSettings(peripheral)


        
    }

    protected updateSettings(peripheral: IBlePeripheral): void {
        try {
            const info = peripheral.getInfo()
            const settings:BleDeviceSettings = {...this.settings} as BleDeviceSettings
            
            settings.id = settings.id ?? info.id
            settings.address = settings.address ??info.address 
            settings.name = settings.name ?? info.name 
            this.settings = settings
        }
        catch {}
    }


    updateSensor(peripheral:IBlePeripheral) {
        throw new Error('method not implemented')
    }


    async close():Promise<boolean> { 
        return true
    
    }

    getSensor():TDevice {        
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
        super.resetData()
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
            this.logEvent( {message:'refreshDeviceData',device:this.getName(),interface:this.getInterface(), data:this.deviceData, isControllable:this.isControllable()})        
        
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
            this.logEvent({message:'error', fn:'refreshDeviceData',device:this.getName(),interface:this.getInterface(), error:err.message, stack:err.stack})
        }


    }

    onDeviceData(deviceData:TDeviceData) {
        try {
            this.dataMsgCount++;
            this.lastDataTS = Date.now();
    
            this.deviceData = {...deviceData} ;        
        
            if (!this.canEmitData()) {
                return;       
            }
    
            this.logEvent( {message:'onDeviceData',device:this.getName(),interface:this.getInterface(),data:deviceData, isControllable:this.isControllable()})        
    
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
            this.logEvent({message:'Error',fn:'onDeviceData', device:this.getName(),interface:this.getInterface(),error:err.message,stack:err.stack})
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

        if (this.started && !wasStopped) {
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

        const ble = this.getBle()
        ble.once('disconnect-done',this.onDisconnectDone.bind(this))

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

        this.logEvent({ message: 'wait for sensor data', device:this.getName(),interface:this.getInterface()});
        const hasData = await waitTask.run();       
        clearInterval(iv)

        if (hasData)
            this.logEvent({ message: 'sensor data received', device:this.getName(),interface:this.getInterface() });
    }


    protected async checkCapabilities():Promise<void> {
        // to be implemeted by controllable adapters
    }

    protected async initControl(_props?:BleStartProperties):Promise<void> {        
        // to be implemeted by controllable adapters
    }

    protected getStartLogProps(props:BleStartProperties):BleStartProperties {

        const capabilities  = this.props?.capabilities 

        const {user,userWeight,bikeWeight,timeout, wheelDiameter,  restart, scanOnly} = props??{}
        return {user,userWeight,bikeWeight,wheelDiameter,timeout, restart, scanOnly, capabilities}
        
    }

    protected async startAdapter( startProps?: BleStartProperties ): Promise<boolean> {

        const props = this.getStartProps(startProps)
        const logProps = this.getStartLogProps(props)
        const {timeout=this.getDefaultStartupTimeout()} = startProps??{}
        const wasPaused = this.paused

        const preCheckResult = await this.startPreChecks(props)
        if (preCheckResult==='done') {
            await resolveNextTick()

            this.logEvent({message: `start result: ${this.started? 'success':'failed'}`, preCheckResult ,device:this.getName(),interface:this.getInterface(), protocol:this.getProtocolName()}) 
            return this.started
        }

        if (preCheckResult==='connection-failed') {            
            this.logEvent({message: 'start result: error', error: 'could not start device, reason:could not connect',device:this.getName(),interface:this.getInterface(), protocol:this.getProtocolName()})
            await resolveNextTick()
            return false
        }
        
        this.logEvent( {message:'starting device', device:this.getName(), interface:this.getInterface(), props:logProps, isStarted: this.started})


        try {
            this.resetData(); 
            this.stopped = false;     

            const connected = await this.startSensor();
            if (connected) {
                this.updateSettings(this.getPeripheral())

                this.logEvent({ message: 'peripheral connected', device:this.getName(), interface:this.getInterface() });                                
            }
            else {
                this.logEvent({ message: 'peripheral connection failed', device:this.getName(), interface:this.getInterface(), reason:'unknown'});    
                this.stopped = true;
                return false
            }

            await this.waitForInitialData(timeout)
            await this.checkCapabilities()        
            const skipControl = this.props.capabilities && !this.props.capabilities.includes(IncyclistCapability.Control);
            if ( this.hasCapability( IncyclistCapability.Control)  && !skipControl)
                await this.initControl(startProps)
                   

            this.stopped = false;    
            this.started = true;

            if (wasPaused)
                this.resume()                

            if (!this.isStarting()) {
                this.logEvent({message: 'start result: interrupted', device:this.getName(),interface:this.getInterface(), protocol:this.getProtocolName()})            
                this.started = false;
                this.stopped = true;
                return false
            }

            this.logEvent({message: 'start result: success', device:this.getName(),interface:this.getInterface(), protocol:this.getProtocolName()})            
            return true;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message,device:this.getName(),interface:this.getInterface(), protocol:this.getProtocolName()})
            this.started = false;
            this.stopped = true;        
            return false
        }
    }

    async startSensor():Promise<boolean> {
        
        if (!this.getSensor()?.hasPeripheral()) {
            await this.waitForPeripheral()
        }
        if (!this.getSensor()) {
            return false
        }

        const sensor = this.getSensor();
        let connected = await sensor.startSensor()

        await sensor.subscribe()

        if(connected) {
            sensor.on('data',this.onDeviceDataHandler) 
            sensor.on('disconnected', this.emit.bind(this))
            sensor.on('error',console.log) 
            connected = await sensor.pair()
        }
        
        return connected
    }

    protected async onDisconnectDone() {
        this.logEvent( {message:'disconnecting device', device:this.getName(),interface:this.getInterface()})
        if (this.isStarting()) {
            await this.startTask.stop()
        }

        let reason:string = 'unknown';
        let stopped = false
        const sensor = this.getSensor();

        try {
            stopped = await sensor.stopSensor();
        }
        catch(err) {    
            reason = err.message;
        }
        if (!stopped) {
            this.logEvent( {message:'disconnecting device failed', device:this.getName(),interface:this.getInterface(), reason})    
        }

    }

    async stop(): Promise<boolean> { 
        this.logEvent( {message:'stopping device', device:this.getName(),interface:this.getInterface()})

        if (this.isStarting()) {
            await this.startTask.stop()
        }

        // make sure that we restart upon next start() call, even if the stop fails
        this.started = false;
        this.resetData()
        
        if (!this.getSensor()) {
            this.logEvent( {message:'device stopped - not started yet', device:this.getName(),interface:this.getInterface()})    
            return true;
        }
        const sensor = this.getSensor();

        sensor.reset();
        this.resetData()        
        this.stopped = true
        this.started = false

        this.logEvent( {message:'device stopped', device:this.getName(),interface:this.getInterface()})    
        return this.stopped
    }

    async pause(): Promise<boolean> {
        const res = await super.pause()

        const ble = this.getBle()
        ble.pauseLogging()

        return res;
    }

    async resume(): Promise<boolean> {

        const ble = this.getBle()
        ble.resumeLogging()

        const res = await super.resume()
        return res;
    }


    protected getBle():IBleInterface<any> {
        return BleMultiTransportInterfaceFactory.createInstance( this.getInterface() )

    } 



    update(): void {
        // not required for BLE
    }

    setCyclingMode(mode: string | ICyclingMode, settings?: any, sendInitCommands?: boolean): void { 
        super.setCyclingMode(mode,settings,sendInitCommands);

        // recalculate speed based on latest data
        this.refreshDeviceData()
    }

    onScanStart(): void {
        if (!this.isStarted())
            this.start()
    }




}

