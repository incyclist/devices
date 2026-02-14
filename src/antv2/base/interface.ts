import { EventEmitter } from "node:events";
import { EventLogger } from "gd-eventlog";
import type { Channel, IAntDevice, IChannel, ISensor } from "incyclist-ant-plus";
import { AntDeviceSettings, AntScanProps,AntInterfaceProps  } from "../types.js";
import { DeviceSettings, IncyclistInterface } from "../../types/index.js";
import AntDeviceBinding from "./binding.js";
import SensorFactory from "../factories/sensor-factory.js";
import { isTrue, runWithTimeout, sleep, waitWithTimeout } from "../../utils/utils.js";
import AntAdapterFactory from "../factories/adapter-factory.js";

type ChannelUsage = 'scan'|'sensor'
interface ChannelInfo  {
    channel: Channel
    usage: ChannelUsage
}


export default class AntInterface   extends EventEmitter implements IncyclistInterface {

    // statics
    static _instance:AntInterface = undefined;
    static INTERFACE_NAME = 'ant'

    static getInstance(props:AntInterfaceProps={}): AntInterface {
        if (AntInterface._instance===undefined)
            AntInterface._instance = new AntInterface(props)
        return AntInterface._instance
    }

    // istanbul ignore next
    static hasInstance(): boolean {
        return AntInterface._instance!==undefined
    }


    protected logger: EventLogger
    protected device: IAntDevice
    protected Binding: typeof AntDeviceBinding
    protected connected: boolean
    protected connectPromise: Promise<boolean>
    protected scanPromise: Promise<AntDeviceSettings[]>
    protected activeScan: { emitter:EventEmitter, channel?: IChannel}
    protected props: AntInterfaceProps
    protected logEnabled: boolean
    protected channelsInUse: Array<ChannelInfo> 
    

    constructor(props:AntInterfaceProps) {  
        super()

        this.props = props;
        this.device = undefined;
        this.connected = false
        this.connectPromise = null
        this.channelsInUse = [];
        this.logEnabled = props.log||true
        const {binding} = props;

        this.setLogger(new EventLogger( 'Ant+'))
        if (binding) {
            this.setBinding(binding)

        }
    }
    getName(): string {
        return AntInterface.INTERFACE_NAME;
    }

    getBinding(): typeof AntDeviceBinding {
        return this.Binding;
    }

    setBinding( binding: typeof AntDeviceBinding) {
        this.Binding = binding
    }

    getLogger() {
        return this.logger
    }

    setLogger(logger:EventLogger) {
        this.logger = logger
    }

    enableLogging() {
        this.logEnabled = true

    }
    disableLogging() {
        this.logEnabled = false
        
    }

    logEvent(event) {
        if (!this.logEnabled || !this.logger)
            return;

        this.logger.logEvent(event)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any
    
        if ( w?.DEVICE_DEBUG ||isTrue(process.env.ANT_DEBUG)) {
            console.log( '~~~ ANT', event)
        }
    }

    isConnected(): boolean {
        return this.connected && this.device!==undefined
    }

    async connect():Promise<boolean> {
        if (this.isConnected())
            return true;
    
        if (this.connectPromise){
            return await this.connectPromise
        }

        const _connect = async ():Promise<boolean>=> {

            try {
                this.logEvent({message:'ANT+ connecting ...'})

                const device = new this.Binding( {...this.props, logger:this.logger} );

                const opened = await device.open();
                if (!opened) {
                    this.logEvent({message:'ANT+ not connected'})
                    return false;
                }

                this.device = device;  
                this.connected = true;
                this.logEvent({message:'ANT+ connected'})


                return true
            }
            catch (err) {
                this.logEvent({message:'error', fn:'connect', error:err.message, stack:err.stack})
                this.connected = false;            
                return false;
            }
        }

        this.connectPromise = _connect()
        return await this.connectPromise
    }

    async disconnect():Promise<boolean> {
        
        this.logEvent({message:'ANT+ disconnecting ...'})
        let closed = false;

        try {
            let promises = []
            if (this.channelsInUse.length>0) {
                this.channelsInUse.forEach(c=>{
                    if (c.usage==='scan')
                        promises.push(this.stopScan())
                    else 
                        promises.push(c.channel.stopAllSensors())
                })
    
                
                await waitWithTimeout(Promise.allSettled( promises), 2000, ()=>{
                    this.logEvent({message:'ANT+ disconnect timeout'})            
                })


                await sleep(200);
    
            }
     
            if (this.device) {
                try {
                    
                    closed = await runWithTimeout(this.device.close(),1000);
                }
                catch {
                    closed = false
                }
            }
            else {
                closed = true
            }
    
    
        }
        catch(err) {
            this.logEvent( {message:'Error', fn:'', error:err.message, stack:err.stack})
            closed = false;
        }

        this.logEvent({message:'ANT+ disconnected'})

        this.connectPromise = null;
        this.scanPromise = null
        this.connected = false;
        return closed;          
    }

    onError( profile,error) {
        this.logEvent( {message:'ANT+ERROR:', profile, error})
    }

    onData( profile,id, data,tag) {
        this.emit( 'data', profile, id, data,tag)
    }

    /* istanbul ignore next */
    getReconnectPause():number {
        return 1000;
    }

    async scannerWaitForConnection() {
        let scanFinished = false;
        let scanStopRequested = false;

        this.activeScan.emitter.once('timeout',()=> {
            this.activeScan.emitter.removeAllListeners()
            scanFinished=true
        })

        this.activeScan.emitter.once('stop',()=>{ 
            scanStopRequested=true; 
            this.activeScan.emitter.removeAllListeners()
        })

        while (!this.isConnected() && !scanFinished && !scanStopRequested) {
            const connected = await this.connect()
            if (!connected)
                await sleep(this.getReconnectPause())
        }

        if (scanStopRequested) 
            this.emit('scan stopped',true)           

        this.activeScan?.emitter.removeAllListeners()
    }

    async scan(props:AntScanProps={}):Promise<AntDeviceSettings[]> {
        this.logEvent({message:'starting scan ..'})

        if (this.isScanning()) {
            return await this.scanPromise
        }


        this.activeScan = { emitter: new EventEmitter()}
        const detected = [];
 
        const _scan =  ()=> new Promise<AntDeviceSettings[]> ( async (done) => {


            const onDetected = (profile:string,deviceID:number)=>{
                if (deviceID && detected.find( s => s.deviceID===deviceID && s.profile===profile)===undefined) {
                    try {
                        detected.push( {interface:this.getName(),profile,deviceID})                    
                        this.emit('device', {interface:'ant',profile,deviceID})
                    }
                    catch(err) { 
                        // istanbul ignore next
                        this.logEvent({message:'error', fn:'onDetected', error:err.message, stack:err.stack})
                    }
                }
            }
            const onData = this.onData.bind(this)
            const onError = this.onError.bind(this)

            const addListeners = (channel) => {
                channel.on('detected', onDetected)
                channel.on('data',onData)
                channel.on('error',onError)   
            }
            const removeListeners = (channel) => {
                channel.off('detected',onDetected)
                channel.off('data',onData)
                channel.off('error',onError)                
            }

            await this.scannerWaitForConnection()
            
            if (!this.isConnected()) {
                return done(detected)
            }

            let channel:Channel;
            channel = this.device.getChannel() as Channel
            if (!channel) 
                return done(detected);  
            this.activeScan.channel = channel

            channel.setProps({logger:this.logger})
            const sensors = SensorFactory.createAll()
            sensors.forEach((sensor)=> {                    
                channel.attach(sensor)
            })
    
            addListeners(channel)
            
            try {
                const success = await channel.startScanner()
                this.blockChannel(channel,'scan')
                this.logEvent({message:'scan started',success})
            }
            catch( err) {
                this.logEvent({message:'scan could not be started',error:err.message, stack:err.stack})    
                this.unblockChannel(channel)
                removeListeners(channel)
                return done(detected)
            }

            this.activeScan.emitter.on('stop',async ()=>{
                this.activeScan.emitter.removeAllListeners()

                this.emit('stop-scan')
                await this.stopDevices(detected)
                await this.stopAllSensors(sensors)

                const stopped = await this.activeScan.channel.stopScanner()
                this.logEvent({message:'scan stopped'})

                removeListeners(channel)
                this.activeScan = undefined
                this.scanPromise=null;
                this.emit('scan stopped',stopped)

                done(detected)
            })

            this.activeScan.emitter.on('timeout',async ()=>{
                this.activeScan.emitter.removeAllListeners()
                await this.activeScan.channel.stopScanner()
                this.emit('stop-scan')
                removeListeners(channel)

                this.logEvent({message:'scan finished(timeout) ..'})

                done(detected)
            })


        })

        const {timeout} = props
    
        this.scanPromise = _scan()

        if (timeout) {
            await waitWithTimeout( this.scanPromise, timeout,()=>{
                this.activeScan?.emitter.emit('timeout')
            }) 
            
            this.scanPromise = null;
            this.activeScan =null;
            return detected
        }
        else {
            const res = await this.scanPromise            
            this.scanPromise = null;
            this.activeScan =null;
            return res;
        }
    }

    isScanning():boolean {
        return this.scanPromise!==undefined && this.scanPromise !== null
    }

    protected async stopAllSensors(sensors:Array<ISensor>):Promise<void> {
        this.logger.logEvent({message:'stopping all sensors '})
        let promises = []
       
        sensors.forEach( (sensor)=>{
            promises.push(this.stopSensor(sensor).catch(err => {
                this.logger.logEvent({message:'could not stop sensor', error:err.message,channel:sensor.getChannel()?.getChannelNo(), stack:err.stack})
            }))
        })
        if (promises.length>0) {
            await Promise.allSettled(promises)
        }
        this.logger.logEvent({message:'sensors stopped'})
    }

    protected async stopDevices(detected:AntDeviceSettings[]):Promise<void> {
        this.logger.logEvent({message:'stopping devices'})
        let promises = []

        detected.forEach( (settings)=>{

            const adapter = AntAdapterFactory.getInstance().createInstance(settings)
            //const adapter = AdapterFactory.create(settings)
            promises.push(adapter.stop().catch(err => {
                this.logger.logEvent({message:'could not stop device', error:err.message,deviceID:settings.deviceID, stack:err.stack})
            }))
        })

        if (promises.length>0) {
            await Promise.allSettled(promises)
        }
        this.logger.logEvent({message:'devices stopped'})

    }

    async stopScan():Promise<boolean> {
        this.logEvent({message:'stopping scan ..'})

        if (!this.isScanning()) {
            this.logEvent({message:'stopping scan done ..'})            
            return true;
        }

        const channel = this.activeScan.channel
        
        return new Promise<boolean>( done => {

            this.activeScan.emitter.emit('stop')
            this.once('scan stopped',(res)=>{
                this.logEvent({message:'stopping scan done ..'})
                this.unblockChannel(channel)

                done(res)
            })
        })
    }

    async startSensor(sensor:ISensor, onDeviceData: (data)=>void ): Promise<boolean> {
        if (!this.isConnected()) {
            const connected = await this.connect()
            if (!connected)
                return false;   
        }

        let channel;
        
        channel = this.device.getChannel()
        if (!channel)
            return false

        this.blockChannel(channel,'sensor'); 
    
        channel.setProps({logger:this.logger})
        const onData = (profile,deviceID,data,tag)=>{
            if (profile===sensor.getProfile() && deviceID===sensor.getDeviceID())
            this.onData(profile,deviceID,data,tag)
            onDeviceData(data)
        }

        channel.on('data',onData)        
        sensor.setChannel(channel);
        
        try {
            const started =  await channel.startSensor(sensor)
            if (!started) {
                this.logEvent( {message:'could not start sensor' })
                channel.off('data',onData)
            }

            this.logEvent( {message:'sensor started', channelNo:sensor.getChannel()?.getChannelNo(), profile:sensor.getProfile(), deviceID:sensor.getDeviceID()})
            return started

        } 
        catch(err) {
            this.logEvent( {message:'could not start sensor', error:err.message, stack:err.stack})
            channel.off('data',onData)
            try {
                await channel.stopSensor(sensor)                
            }
            catch{}
            this.unblockChannel(channel);
            return false;
        }
    }

    private blockChannel(channel: any,usage:ChannelUsage) {
        this.channelsInUse.push({ channel:channel as Channel, usage});
    }

    private unblockChannel(channel: any) {
        const idx = this.channelsInUse.findIndex(c => c.channel?.getChannelNo() === channel.getChannelNo());
        if (idx!==-1)
            this.channelsInUse.splice(idx, 1);
    }

    async stopSensor(sensor:ISensor): Promise<boolean> {

        if (!this.isConnected()) {
            return true
        }

        const channel = sensor.getChannel() as Channel
        if (channel!==undefined && channel!==null ) {
            try {

                // old versions of ant-plus library did not have a flush functionn
                // As this old version still might be used in an old Incyclist app, we have to re-create it
                if (!channel.flush) {
                    this.logEvent( {message:'old version of ant-channel detected' })
                    channel.flush = () => {
                        const c = channel as any
                        c.messageQueue.forEach( msg => {msg.resolve(false) })
                        c.messageQueue = [];
                        c.isWriting = false;
                    }
                }
                channel.flush();
                channel.removeAllListeners('data')
                
                const stopped = await channel.stopSensor(sensor)
                this.unblockChannel(channel)
                return stopped
            }
            catch(err) {
                this.logEvent( {message:'could not stop sensor', error:err.message,deviceID:sensor.getDeviceID(), stack:err.stack})
                return false;
            }
        }
        else {
            //this.logEvent( {message:'could not stop sensor', deviceID:sensor.getDeviceID(), error:'no channel attached'})
            return true;
        }
    }


    addKnownDevice(_settings: DeviceSettings): void {
        // not supported
    }



}