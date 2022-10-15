import { resolve } from "dns";
import EventEmitter from "events";
import { EventLogger } from "gd-eventlog";
import { Channel, IAntDevice, IChannel, ISensor } from "incyclist-ant-plus";
import AntDeviceBinding from "./ant-binding";
import { AntScannerProps, AntScanProps } from "./incyclist-protocol";
import SensorFactory from "./sensor-factory";

export type AntInterfaceProps = {
    binding?: typeof AntDeviceBinding, 
    logger?:EventLogger,
    startupTimeout?: number
}

export default class AntInterface  extends EventEmitter  {

    // statics
    static _instance:AntInterface = undefined;

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
    protected isConnected: boolean
    protected isConnecting: boolean
    protected props: AntInterfaceProps
    protected activeScan: IChannel
    

    constructor(props:AntInterfaceProps) {  
        super()

        this.props = props;
        this.device = undefined;
        this.isConnected = false;
        this.isConnecting = false;

        const {binding, logger} = props;

        if ( logger ) 
            this.logger = logger
        else {
            this.logger = new EventLogger( 'Ant+');
        }

        if (binding) {
            this.Binding = binding

        }
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
    }

    async connect() {
        if (this.isConnected)
            return true;

        if (!this.isConnecting) {

            this.isConnecting = true;
            this.logEvent({message:'ANT+ connecting ...'})

            try {
                const device = new this.Binding( {...this.props, logger:this.logger} );

        
                const opened = await device.open();
                if (!opened) {
                    this.logEvent({message:'could not connect'})
                    this.isConnecting = false;
                    return false;
                }

                this.device = device;  
                this.isConnected = true          
                this.isConnecting = false;
                this.logEvent({message:'ANT+ connected'})


                return true
            }
            catch (err) {
                this.isConnected = false;
                this.isConnecting = false;
                return false;
            }
        }
        else {
            return new Promise (resolve => {
                setInterval( ()=>{
                    if (!this.isConnecting)
                        resolve(this.isConnected)
                },500)
            })
            
        }
    }

    async disconnect() {
        if (!this.device)
            return true;
        this.logEvent({message:'disconnecting ...'})
        const closed = await this.device.close();
        this.isConnected = !closed;
        this.logEvent({message:'disconnected'})
        return closed;          

    }

    onError( profile,error) {
        this.logEvent( {message:'ANT+ERROR:', profile, error})
    }

    onData( profile,id, data,tag) {
        this.emit( 'data', profile, id, data,tag)
        //console.log( 'DATA:', profile, data)
    }


    async scan(props:AntScannerProps={}) {
        this.logEvent({message:'starting scan ..'})

        const detected = [];

        if (!this.isConnected) {
            const connected = await this.connect()
            if (!connected)
                return [];   
        }

        

        const onDetected = (profile:string,deviceID:number)=>{
            if (deviceID && detected.find( s => s.deviceID===deviceID && s.profile===profile)===undefined) {
                try {
                    detected.push( {profile,deviceID})                    
                    this.emit('detected', profile,deviceID)
                }
                catch(err) {
                    this.logEvent({message:'error', fn:'onDerected', error:err.message, stack:err.stack})
                }
            }
        }

        let channel;

        if (!this.activeScan) {   

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
            const success = await channel.startScanner()
            this.logEvent({message:'scan started',success})

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
            console.log('ERROR',err)
            return false;
        }       

    }

    async startSensor(sensor:ISensor, onDeviceData: (data)=>void ): Promise<boolean> {
        if (!this.isConnected) {
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
            if (profile===sensor.getProfile() && deviceID===sensor.getDeviceID())
            onDeviceData(data)
        })        

        
        try {
            return await channel.startSensor(sensor)
        } 
        catch(err) {
            try {
                await channel.stopSensor(sensor)
            }
            catch{}

            throw err
        }
    }

    async stopSensor(sensor:ISensor): Promise<boolean> {
        if (!this.isConnected || !this.device) 
        return true

        const channel = sensor.getChannel() as Channel

        channel.removeAllListeners('data')
        if (channel)
            return await channel.stopSensor(sensor)
    }

    isScanning(): boolean {
        return (this.activeScan===undefined || this.activeScan===null)
    }




}