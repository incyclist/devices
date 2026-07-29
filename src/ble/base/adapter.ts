
import IncyclistDevice from "../../base/adpater.js";
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties, IBleInterface, IBlePeripheral } from "../types.js";
import { IAdapter,IncyclistBikeData,IncyclistAdapterData,DeviceProperties, IncyclistInterface, IncyclistCapability} from "../../types/index.js";
import { BleDeviceData } from "./types.js";
import { LegacyProfile } from "../../antv2/types.js";
import ICyclingMode from "../../modes/types.js";
import { BleMultiTransportInterfaceFactory } from "../factories/interface-factory.js";
import { InteruptableTask, TaskState } from "../../utils/task.js";
import { TBleSensor } from "./sensor.js";
import { resolveNextTick } from "../../utils/utils.js";


export default class BleAdapter<TDeviceData extends BleDeviceData, TDevice extends TBleSensor>  extends IncyclistDevice<BleDeviceProperties>  { 

    protected deviceData: TDeviceData
    protected dataMsgCount: number
    protected lastDataTS: number;
    protected device: TDevice
    protected onDeviceDataHandler = this.onDeviceData.bind(this)
    protected onDeviceDisconnectHandler = this.emit.bind(this)
    protected onDisconnectDoneHandler = this.onDisconnectDone.bind(this)
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
            const id = (settings.id ?? settings.address ?? '').replace(/[:\-]/g, '')


            const addressHash = id.length > 4 ? id.slice(-4).toUpperCase() : id.toUpperCase() 
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
            // by the time we get here, waitForPeripheral() has already established that this
            // peripheral IS the device identified by `settings` (matched by name/id) - so a freshly
            // observed address is always more trustworthy than a persisted one, which may be stale
            // (e.g. a wifi/mDNS device's IP changed since it was last paired - see FIXES_BACKLOG #14).
            // Previously this used `settings.address ?? info.address`, which meant that once an
            // address was recorded (even a stale one), a fresh observation could never overwrite it.
            settings.address = info.address ?? settings.address
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

        if (as.protocol!==settings.protocol)
            return false

        // a stable id (e.g. derived from an mDNS serialNo) is the strongest identity signal
        if (as.id && settings.id)
            return as.id===settings.id

        // if both sides carry an address, it alone decides equality - once we have two
        // independently observed addresses, a shared/generic name (e.g. two "Volt" trainers) must
        // no longer be treated as sufficient to consider them the same device (see FIXES_BACKLOG #14 -
        // previously this was an OR across name/address/id, so a name-only match was enough to
        // incorrectly merge two distinct physical devices into one)
        if (as.address && settings.address)
            return as.address===settings.address

        // neither side has a comparable address/id - fall back to name (e.g. before a wifi device's
        // first mDNS announcement has been observed, or for protocols with no stable address)
        return !!(as.name && settings.name && as.name===settings.name)
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
        
        
        ble.once('disconnect-done',this.onDisconnectDoneHandler)

        this.startTask = new InteruptableTask( this.startAdapter(startProps), {
            timeout: startProps?.timeout,
            name:'start',
            errorOnTimeout: false,
            log: this.logEvent.bind(this)
        })

        const res = await this.startTask.run()

        if (!res) {
            ble.removeListener('disconnect-done',this.onDisconnectDoneHandler)
        }
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

    protected async initControlBestEffort(_props?:BleStartProperties):Promise<void> {
        // to be implemented by controllable adapters that support a best-effort control handshake
        // for devices that have been downgraded (e.g. FTMS Power Meter-only devices - see
        // BleFmAdapter.initControlBestEffort, FIXES_BACKLOG #22)
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

            // FIXES_BACKLOG #22: checkCapabilities() (a GATT read, not dependent on notification data)
            // must run before waitForInitialData(), so the FTMS Control Point handshake
            // (RequestControl/StartOrResume) can be attempted *before* the data-wait timeout, not only
            // after it - some FTMS firmwares won't start streaming Indoor Bike Data notifications at all
            // until that handshake has happened.
            await this.checkCapabilities()
            const skipControl = this.props.capabilities && !this.props.capabilities.includes(IncyclistCapability.Control);
            const isControllable = this.hasCapability( IncyclistCapability.Control) && !skipControl

            if (isControllable) {
                // controllable devices: RequestControl gates pairing success - initControl() is
                // expected to throw if control could not be established within its own dedicated
                // timeout, failing pairing fast (caught below) rather than silently exhausting the
                // whole data-wait timeout.
                await this.initControl(startProps)
            }
            else {
                // devices without a settable target (already downgraded, e.g. FTMS Power Meter-only):
                // attempt the same handshake best-effort - any outcome is only logged, never fatal.
                // waitForInitialData() below remains the sole arbiter of pairing success for these.
                await this.initControlBestEffort(startProps)
            }

            await this.waitForInitialData(timeout)

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
        catch(err:any) {
            this.logEvent({message: 'start result: error', error: err.message,stack:err.stack,device:this.getName(),interface:this.getInterface(), protocol:this.getProtocolName()})
            this.started = false;
            this.stopped = true;      
            const ble = this.getBle()
            ble.removeListener('disconnect-done',this.onDisconnectDoneHandler)
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
            sensor.on('disconnected', this.onDeviceDisconnectHandler)
            sensor.on('error',console.log) 
            connected = await sensor.pair()
        }
        
        return connected
    }

    protected async onDisconnectDone() {
        try { this.getBle().removeAllListeners('disconnect-done') } catch {}

        this.logEvent( {message:'disconnecting device', device:this.getName(),interface:this.getInterface()})
        if (this.isStarting()) {
            await this.startTask.stop()
        }

        let reason:string = 'unknown';
        let stopped = false
        const sensor = this.getSensor();

        try {
            stopped = await sensor.stopSensor();    
            this.logEvent( {message:'disconnecting device completed', device:this.getName(),interface:this.getInterface()})
            
        }
        catch(err) {    
            reason = err.message;
        }
        if (!stopped) {
            this.logEvent( {message:'disconnecting device failed', device:this.getName(),interface:this.getInterface(), reason})    
        }

    }

    async restart(pause?:number):Promise<boolean> {

        const sensor = this.getSensor();

        sensor.off('data',this.onDeviceDataHandler) 

        // is the sensore already reconnecting (due to disconnect signal)
        let connected = false
        if (sensor.isReconnectBusy()) {
            connected = await sensor.reconnectSensor(true)
            if (connected) {
                sensor.on('data',this.onDeviceDataHandler) 
            }
            return connected
        }


        // make sure that the sensor is unregistering all subscriptions (otherwise it might re-use)
        await sensor.getPeripheral().disconnect()
        const success = await super.restart(pause)
        return success;

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


        sensor.off('data',this.onDeviceDataHandler) 
        sensor.off('disconnected', this.onDeviceDisconnectHandler)
        sensor.off('error',console.log) 
        const ble = this.getBle()
        ble.removeListener('disconnect-done',this.onDisconnectDoneHandler)

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

