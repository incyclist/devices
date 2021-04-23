import { EventLogger } from "gd-eventlog";
import DeviceProtocolBase,{INTERFACE,DeviceProtocol} from "../DeviceProtocol";
import AntHrmAdapter from './anthrm/AntHrmAdapter'
import AntAdapter from "./AntAdapter";
import AntFEAdapter from "./antfe/AntFEAdapter";

const LOGGER_NAME = 'ANT+Scanner'
const DEFAULT_SCAN_TIMEOUT  = 30000; // 30s

const hex = (n,len) => {
    const c = "0";
    let s = n.toString(16);
    if (s.length<len) 
        return  `0x${c.repeat(len-s.length)}${s}`
    return  `0x${s}`
} 

type ScanState = {
    isScanning: boolean;
    timeout?: number;
    iv?: any;
    stick;
}

type AntAdapterInfo = {
    name: string,
    Adapter: any
}




class AntProfile  {
    scanner: any;
    profile:string;
    ids: Array<string>;

    constructor( profile, AntScannerClass, stick, message, onNewDevice, onData) {
        if (process.env.ANT_PROFILE_DEBUG)
            console.log('adding profile',profile, AntScannerClass, message, onNewDevice, onData);
        this.ids=[];
        this.scanner = new AntScannerClass(stick);
        this.scanner.on(message, data=> {
            try {
                if (process.env.ANT_PROFILE_DEBUG)
                    console.log(data);

                if ( data.DeviceID) {
                    if (this.ids.find( id=> id===data.DeviceID)) {
                        if(onData) onData(profile,data.DeviceID,data)
                        return;
                    }
                    this.ids.push(data.DeviceID)
                    if ( onNewDevice) 
                        onNewDevice(profile,data.DeviceID)
    
                }
    
            }
            catch (err) {

            }
        } )
    }
    getScanner() {
        return this.scanner;
    }
    getProfile():string {
        return this.profile;
    }

}

export class AntProtocol extends DeviceProtocolBase implements DeviceProtocol{
    logger: EventLogger;
    ant: any;
    activeScans: Record<string,ScanState>
    profiles: Array<AntAdapterInfo>
    sensors: any
    sticks: Array<any>
    

    constructor(antClass) {
        super()
        this.logger = new EventLogger(LOGGER_NAME)
        this.ant = antClass;
        this.activeScans = {}
        this.sensors = {}
        this.sticks = []

        this.profiles = [
            { name:'Heartrate Monitor', Adapter: AntHrmAdapter },
            { name:'Smart Trainer', Adapter: AntFEAdapter }
        ]
    }

    getAnt() { 
        return this.ant || DeviceProtocolBase.getAnt()
    }

    getName(): string { return 'Ant'}
    getInterfaces(): Array<string> { return [INTERFACE.ANT]}
    isBike(): boolean { return true;}
    isHrm(): boolean { return true;}
    isPower(): boolean { return true;}
    isScanning(): boolean { return Object.keys(this.activeScans).length>0 }

    getSupportedProfiles(): Array<string> {
        return this.profiles.map( i => i.name)
    }

    getUSBDeviceInfo(d) {
        if(!d)
            return;
        return ({ 
            port: `usb:${d.busNumber}-${d.deviceAddress}`,
            vendor:d.deviceDescriptor.idVendor, 
            product:d.deviceDescriptor.idProduct,
            inUse:d.inUse
        })
    }

    getStickInfo(sticks) {
        const isStick = i => {
            return ( i && i.vendor===0x0FCF && (i.product===0x1008 || i.product===0x1009 ))
        }
        const inUse = i => i&&i.inUse
        
        return sticks
            .map( d => this.getUSBDeviceInfo(d))
            .reduce ( (r,i) => r+`${r===''?'':','}[${i.port} ${hex(i.vendor,4)} ${hex(i.product,4)}${isStick(i)?'*':''}${inUse(i)?'x':''}]`,  '')   
    }

    findStickByPort(port) {
        const info = this.sticks.find( i=> i.port===port)
        if (info)
            return info.stick;
    }

    logStickInfo() {
        const sticks = this.ant.getSticks();
        const info = this.getStickInfo(sticks)
        this.logger.logEvent( {message:'stick info', info} )
    }

    getStick() {
        if (!this.ant)
            return;
        
        const stick2 = new this.ant.GarminStick2();
        if ( stick2.is_present() && stick2.open()) {
            this.logger.logEvent( {message:'found GarminStick2'})
            return stick2;
        }

        const stick3 = new this.ant.GarminStick3();
        if ( stick3.is_present() && stick3.open()) {
            this.logger.logEvent( {message:'found GarminStick3'})
            return stick3;
        }

        return undefined;
    }

    async getSticks(): Promise<Array<any>> {
        if (!this.ant)
            return;
    
        let done = false;
        const sticks = [];
        
        while (!done) {
            const stick = this.getStick();
            if ( stick) {
                const port = this.getUSBDeviceInfo(stick.device).port;
                sticks.push(stick);
                if (!this.sticks.find( i => i.port===port ) ) {
                    this.sticks.push( {port,stick})
                }
            }
            else
                done = true;
        }

        const stickInfos = sticks.map ( stick => {return { stick, port:this.getUSBDeviceInfo(stick.device).port}}  )


        for ( let i=0;i<sticks.length;i++)  {
            await this.closeStick(sticks[i])
        }
        return stickInfos;
    }

    closeStick(stick) {
        if (process.env.DEBUG)
            console.log('~~~Ant:closeStick')
        return new Promise ( (resolve,reject) => {
            stick.on('shutdown', () => { 
                stick.removeAllListeners('shutdown')
                this.sensors.stickStarted = false;
                this.sensors.stickOpen = false;
                resolve(true)
            });
            try {
                stick.detach_all();
                setTimeout( ()=>{
                    try {
                        stick.close()
        
                    }
                    catch(err) {}
                    
                },1000)
                
            }
            catch( err) 
            {
                reject(err);
            }
        })
    }

    
    stopScanOnStick( stickInfo) {
        const {stick,port} =stickInfo;
        const state = this.activeScans[port] 
        
        return this.closeStick(stick)
        .then (
            ()=> {
                state.isScanning = false;
                if ( state.iv) {
                    clearInterval(state.iv);
                    state.iv=undefined;
                }
                return true;
            }
        )
        .catch(err => {
            this.logger.logEvent( {message:'error on closing stick',error:err.message,port})
            return true;
        })
    } 

    scanOnStick(stickInfo,props={} as any ) {
        const {stick,port} =stickInfo;
        const timeout = props.timeout || DEFAULT_SCAN_TIMEOUT;
        const {onDeviceFound,onScanFinished,onUpdate,id} = props;

        return new Promise ( (resolve,reject) => {

            stick.once('startup', () => { 
                if (!port || (this.activeScans[port] && this.activeScans[port].isScanning))
                    return
        
                if ( !this.activeScans[port]) {
                    this.activeScans[port] = { isScanning:false,stick} 
                }
                const state = this.activeScans[port];
                if(state.isScanning)
                    return;
        
                state.isScanning = true;
                this.logger.logEvent( {message:'start scan',port});
                state.timeout = Date.now()+timeout;

                const onNewDevice = (profile: string,deviceId: string)  => {
                    this.logger.logEvent( {message:'found device',profile,id:deviceId})
                    const profileInfo = this.profiles.find( i => i.name===profile);
                    if ( profileInfo) {
                        let device;
                        try {
                            device = new profileInfo.Adapter(deviceId,port,stick,this,props)
                            this.devices.push(device)
                        }
                        catch ( err) {
                            //TODO
                            console.log(err)
                        }

                        if (device && onDeviceFound) {
                            onDeviceFound(device,this);
                            device.setDetected(true);
                        }

                        
                    }
                }

                const onData = (profile: string,deviceId: string, data:any) => {
                    const device = this.devices.find( d => d.getID()===deviceId) as AntAdapter
                    if ( device ) {
                        const isHrm = device.isHrm();
                        device.onDeviceData(data)
                        if ( device.isHrm() && !isHrm && onDeviceFound )  {
                            onDeviceFound(device,this);
                        }
                        if(onUpdate)
                            onUpdate(device);
                    }
                }

                const hrm = new AntProfile( 'Heartrate Monitor', this.ant.HeartRateScanner, stick, 'hbData', onNewDevice, onData)
                const fe = new AntProfile( 'Smart Trainer', this.ant.FitnessEquipmentScanner, stick, 'fitnessData', onNewDevice, onData)
                const power = new AntProfile('Power Meter' , this.ant.BicyclePowerScanner, stick, 'powerData', onNewDevice, onData)

                hrm.getScanner().scan()
                hrm.getScanner().on( 'attached', ()=> {
                    power.getScanner().scan();
                    fe.getScanner().scan();

                });

                state.iv = setInterval( ()=> {
                    if ( Date.now()>timeout) {
                        this.logger.logEvent( {message:'scan timeout',port});
                        this.stopScanOnStick(stickInfo).then( ()=>{
                            if ( onScanFinished) 
                                onScanFinished(id)
                            resolve(true)
                        })

                    }
                } ,timeout);
        
            });

            let opened = false;
            try {
                opened = stick.open();
            }
            catch(err) {}
            if (!opened) {
                reject( new Error('stick could not be opened'))
                return;
            } 
            this.logger.log('stick opened',port)
        })
    }
    

    async scan(props) {
        this.logStickInfo();
        const sticks = await this.getSticks()    
        
        if ( sticks && sticks.length>0) {
            const stick = sticks[0];
            this.scanOnStick(stick,props)
        }
        else {
            this.logger.logEvent( {message:'no stick found'})
        }
    }

    async stopScan() {
        const activePorts = Object.keys(this.activeScans)
        for ( let i=0;i<activePorts.length;i++) {
            const port = activePorts[i]
            const scanState = this.activeScans[port];
            if ( scanState.isScanning) {
                await this.stopScanOnStick( {port,stick:scanState.stick})
            }
        }
        this.logger.logEvent({message:'scan stopped'})
        return true;
    }

    async attachSensors( d: AntAdapter | Array<AntAdapter>, SensorClass,message) {
        return new Promise( (resolve,reject) => {
            if ( d===undefined) {
                resolve(false)
                return;
            }

            const devices = Array.isArray(d) ? d : [d] ;
            if (devices.length===0) {
                return resolve(false);
            }

            if (!this.sensors.stick) {
                const stick = this.findStickByPort(devices[0].getPort());
                let opened = false;
        
                if (!stick.inUse) {
                    try {
                        stick.open();
                        opened = true;
                    }
                    catch(err) {
                        console.log(err)
                    }
                    if(!opened)
                        return false;
                }
                else {
                    opened = true;
                }
                this.sensors.stick = stick;
                this.sensors.stickOpen = opened;
            }

            if (this.sensors.stickOpen) {
                if (!this.sensors.pending) this.sensors.pending=[];
                devices.forEach ( device => {
                    const sensor = new SensorClass(this.sensors.stick);
                    device.setSensor(sensor);
                    sensor.on(message, (data)=> {device.onDeviceData(data)})
                    sensor.on('eventData', (data)=> {device.onDeviceEvent(data)})
                    sensor.once('attached',()=>{ device.onAttached() })

                    this.sensors.pending.push( {device, sensor,message})
        
                })
            }

            const attachFromPending = () => {
                if (!this.sensors.attached)
                    this.sensors.attached = [];
                
                
                const channelsUsed = this.sensors.attached.length;
                this.sensors.pending.forEach( (i,idx) => {
                    const channel = channelsUsed + idx;
                    const {sensor} = i;    
                    i.device.setChannel(channel);
                    if ( process.env.DEBUG)
                        console.log('~~~~Ant: attach', channel,i.device.getID() )
                    sensor.attach(channel,i.device.getID())
                    this.sensors.attached.push(i);
                })
                this.sensors.pending = [];
                resolve(true)


            }

            if ( this.sensors.stickStarted) {
                attachFromPending()
            }
            else {
                this.sensors.stick.once('startup',()=> {
                    this.sensors.stickStarted = true;
                    setTimeout( attachFromPending, 1000)                
                })

            }

        });
    }

    detachSensor(adapter: AntAdapter) {

        return new Promise ( async (resolve, reject)  => {
            const idx = this.sensors.attached.findIndex( i => (i.device.getID()===adapter.getID() && i.device.getName()===adapter.getName()) );
            if (idx===-1) 
                return resolve(true);

            this.sensors.attached.splice(idx,1);
            if ( this.sensors.attached.length>0) 
                return resolve(true);

            const stick = this.sensors.stick;

            if ( stick===undefined)
                return resolve(false);

            try {
                
                await this.closeStick(stick);
                resolve(true);

            }
            catch(err) {
                reject(err)
            }                    
            
            
    
        })

    }

    async closeSensor(device) {
        const stick = this.findStickByPort(device.getPort());
        if (stick.inUse) {
            try {
                stick.close()
            }
            catch(err) {
                console.log(err)
            }
        }

    }



}

let _scanner = undefined;

export function AntScanner( antClass) {
    const scanner = _scanner || new AntProtocol(antClass);
    return scanner;    
}