import EventEmitter from "events";
import { EventLogger } from "gd-eventlog";
import { Channel, IAntDevice, IChannel, ISensor } from "incyclist-ant-plus";
import { InterfaceProps } from "../types/interface";
import AntDeviceBinding from "./binding";
import { IncyclistInterface } from "../types/interface";

import SensorFactory from "./sensor-factory";
import { AntDeviceSettings, AntScanProps } from "./types";

export interface AntInterfaceProps extends InterfaceProps  {
    startupTimeout?: number
}

export interface ConnectState {
    connected: boolean;
    connecting: boolean;
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

    static hasInstance(): boolean {
        return AntInterface._instance!==undefined
    }


    protected logger: EventLogger
    protected device: IAntDevice
    protected Binding: typeof AntDeviceBinding
    protected connectState: ConnectState
    protected props: AntInterfaceProps
    protected activeScan: IChannel
    

    constructor(props:AntInterfaceProps) {  
        super()

        this.props = props;
        this.device = undefined;
        this.connectState = { 
            connected: false,
            connecting: false
        }

        const {binding, logger} = props;

        if ( logger ) 
            this.logger = logger
        else {
            this.logger = new EventLogger( 'Ant+');
        }

        if (binding) {
            this.Binding = binding as (typeof AntDeviceBinding)

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

    setLogger(logger:EventLogger) {
        this.logger = logger
    }

    logEvent(event) {
        if (this.logger)
            this.logger.logEvent(event)
        console.log('~~~ ANT', event)
    }

    isConnected(): boolean {
        return this.connectState.connected
    }

    async connect():Promise<boolean> {
        if (this.isConnected())
            return true;

        if (!this.connectState.connecting) {

            this.connectState.connecting = true;
            this.logEvent({message:'ANT+ connecting ...'})

            try {
                const device = new this.Binding( {...this.props, logger:this.logger} );

                const opened = await device.open();
                if (!opened) {
                    this.logEvent({message:'ANT+ not connected'})
                    this.connectState.connecting = false;                    
                    return false;
                }

                this.device = device;  
                this.connectState.connected = true          
                this.connectState.connecting = false;
                this.logEvent({message:'ANT+ connected'})


                return true
            }
            catch (err) {
                this.logEvent({message:'error', fn:'connect', error:err.message, stack:err.stack})
                this.connectState.connected = false;
                this.connectState.connecting = false;
                return false;
            }
        }
        else {
            return new Promise (resolve => {
                setInterval( ()=>{
                    if (!this.connectState.connecting)
                        resolve(this.connectState.connected)
                },500)
            })
            
        }
    }

    async disconnect():Promise<boolean> {
        if (!this.device)
            return true;
        this.logEvent({message:'ANT+ disconnecting ...'})
        const closed = await this.device.close();
        this.connectState.connected = !closed;
        this.logEvent({message:'ANT+ disconnected'})
        return closed;          

    }

    onError( profile,error) {
        this.logEvent( {message:'ANT+ERROR:', profile, error})
    }

    onData( profile,id, data,tag) {
        this.emit( 'data', profile, id, data,tag)
    }


    async scan(props:AntScanProps={}):Promise<AntDeviceSettings[]> {
        this.logEvent({message:'starting scan ..'})

        const detected = [];

        const onDetected = (profile:string,deviceID:number)=>{
            if (deviceID && detected.find( s => s.deviceID===deviceID && s.profile===profile)===undefined) {
                try {
                    detected.push( {interface:this.getName(),profile,deviceID})                    
                    this.emit('device', {interface:'ant',profile,deviceID})
                }
                catch(err) {
                    this.logEvent({message:'error', fn:'onDerected', error:err.message, stack:err.stack})
                }
            }
        }

        let channel;

        if (!this.activeScan) {   

            while (!this.isConnected()) {
                const connected = await this.connect()
                if (!connected)
                    return [];   
            }
    
            channel = this.device.getChannel()
            channel.setProps({logger:this.logger})
            if (!channel) 
                return [];  

            const sensors = SensorFactory.createAll()
            sensors.forEach((sensor)=> {                    
                channel.attach(sensor)
            })
    
            channel.on('detected', onDetected)
            channel.on('data',this.onData.bind(this))
            
            try {
                const success = await channel.startScanner()
                this.logEvent({message:'scan started',success})
            }
            catch( err) {
                this.logEvent({message:'scan could not be started',error:err.message, stack:err.stack})    
                channel.off('detected',onDetected)
                channel.off('data',this.onData.bind(this))
                return []
            }

            let iv ;
            return new Promise( resolve => {

                this.activeScan = channel;
                const start = Date.now();
                const timeout = props.timeout ? start+props.timeout : undefined
                
                iv = setInterval( async ()=>{   
                    if (this.activeScan && (!timeout || Date.now()<timeout))
                        return;

                    clearInterval(iv)
                    if (this.activeScan)
                        await this.stopScan()

                    this.emit('stop-scan')
                    channel.off('detected',onDetected)
                    channel.off('data',this.onData.bind(this))
                    resolve(detected)
                },100)
                
            }) 
            
        }
        else {
            // connect to ongoing scan
            return new Promise(resolve => {
                channel = this.activeScan
                channel.on('data',this.onData.bind(this))
                channel.on('detected', onDetected)
                this.once( 'stop-scan' ,()=>{
                    channel.off('detected',onDetected)
                    channel.off('data',this.onData.bind(this))
                    resolve(detected)
                })
    
            })
        }

    }

    async stopScan() {
        this.logEvent({message:'stopping scan ..'})

        if (!this.activeScan)
            return false;


        const channel = this.activeScan
    
        try {
            const stopped = await channel.stopScanner()
            this.activeScan = undefined
            this.logEvent({message:'scan stopped'})

            return stopped
        }
        catch(err) {
            this.logEvent({message:'error', fn:'stopScan()', error:err.message, stack:err.stack})
            return false;
        }       

    }

    async startSensor(sensor:ISensor, onDeviceData: (data)=>void ): Promise<boolean> {
        if (!this.isConnected()) {
            const connected = await this.connect()
            if (!connected)
                return false;   
        }

        let channel;
        
        channel = this.device.getChannel()
        channel.setProps({logger:this.logger})
        if (!channel)
            return false

        channel.on('data',this.onData.bind(this))
        sensor.setChannel(channel);

        this.on('data',(profile,deviceID,data)=>{
            //console.log(profile,sensor.getProfile(),deviceID,sensor.getDeviceID(),data,onDeviceData)
            if (profile===sensor.getProfile() && deviceID===sensor.getDeviceID())
            onDeviceData(data)
        })        

        
        try {
            return await channel.startSensor(sensor)
        } 
        catch(err) {
            this.logEvent( {message:'could not start sensor', error:err.message||err, stack:err.stack})
            try {
                await channel.stopSensor(sensor)
            }
            catch{}

            return false;
        }
    }

    async stopSensor(sensor:ISensor): Promise<boolean> {

        if (!this.isConnected() || !this.device) {
            return true
        }

        const channel = sensor.getChannel() as Channel
        if (channel) {
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
                return stopped
            }
            catch(err) {
                this.logEvent( {message:'could not stop sensor', error:err.message||err, stack:err.stack})
                return false;
            }
        }
        else {
            this.logEvent( {message:'could not stop sensor', error:'no channel attached'})
            return false;
        }
    }

    isScanning(): boolean {
        return (this.activeScan===undefined || this.activeScan===null)
    }




}