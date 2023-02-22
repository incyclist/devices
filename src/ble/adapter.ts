
import IncyclistDevice,{ DEFAULT_BIKE_WEIGHT, DEFAULT_PROPS, DEFAULT_USER_WEIGHT } from "../base/adpater";
import CyclingMode from "../modes/cycling-mode";
import { Bike } from "../types/adapter";
import { DeviceData } from "../types/data";
import { DeviceProperties, DeviceSettings } from "../types/device";
import { User } from "../types/user";
import { BleComms } from "./base/comms";
import BleInterface from "./ble-interface";
import { BleDeviceProperties, BleDeviceSettings } from "./types";

const INTERFACE_NAME = 'ble'


export default class BleAdapter  extends IncyclistDevice  { 

    ble: BleInterface
    deviceData: any
    data: DeviceData
    dataMsgCount: number
    lastDataTS: number;
    updateFrequency: number;
    device: BleComms


    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props)

        if (this.settings.interface!==INTERFACE_NAME)
            throw new Error ('Incorrect interface')

        this.deviceData = {}
        this.data = {}
        this.dataMsgCount = 0;
        this.updateFrequency = 1000;
    

        this.ble = BleInterface.getInstance()
    }

    async connect():Promise<boolean> { 
        if (!this.device) {
            // should never happen
            throw new Error('No Comms')
        }

        if (this.isConnected())
            return true;
        
        let connected = false;
        try  {
            connected = await this.device.connect()
            console.log('~~~ connected')
        }
        catch(err) {
            console.log('~~~ ERROR',err)
        }
        return connected
    }

    async close():Promise<boolean> { 
        if (!this.device || !this.isConnected())
            return true;

        if (this.device) {
            await this.device.disconnect()
            this.ble.removeConnectedDevice(this)
            return true;
        }

    }

    getComms():BleComms {
        return this.device
    }

    check(): Promise<boolean> {throw new Error("Method not implemented.");}

    isEqual(settings: BleDeviceSettings): boolean {
        const as = this.settings as BleDeviceSettings;

        if (as.interface!==settings.interface)
            return false;

        if (as.profile || settings.profile)  { // legacy
            return (as.protocol===settings.protocol && as.profile===settings.profile && as.name===settings.name)
        }
        else {
            return (as.protocol===settings.protocol && (as.name===settings.name || as.address===settings.address || as.id===settings.id)  ) 
        }

    }
    isSame( adapter: BleAdapter):boolean {
        return this.isEqual( adapter.getSettings())
    }

    isConnected():boolean {
        return this.device && this.device.isConnected()
    }

    resetData() {
        this.dataMsgCount = 0;        
        this.deviceData = {}
        this.data= {}
        this.lastDataTS = undefined
    }

    getInterface(): string {
        return INTERFACE_NAME
    }

    getProtocolName():string {
        const settings = this.settings as BleDeviceSettings
        return settings.protocol
    }

    getID(): string {
        const settings = this.settings as BleDeviceSettings
        return settings.id
    }

    getName(): string {
        const settings = this.settings as BleDeviceSettings
        return settings.name || settings.id || settings.address
    }

    onDeviceData(deviceData:any) {
        this.dataMsgCount++;
        this.lastDataTS = Date.now();

        this.deviceData = Object.assign( {},deviceData);        
    }

    getSettings(): BleDeviceSettings {
        return this.settings as BleDeviceSettings
    }
    setProperties(props:BleDeviceProperties) {
        this.props = props
    }

    async start( props: DeviceProperties={} ): Promise<any> {
        if (this.started)
            return true;

        if ( this.ble.isScanning()) {
            this.logger.logEvent({message:'stop previous scan',isScanning:this.ble.isScanning()})
            await this.ble.stopScan();
        }

        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)
            

        
        this.logger.logEvent({message: 'start requested', protocol:this.getProtocolName(),props})
        try {
            const comms = this.device;
            
            if (comms) {
                
                comms.on('data', (data)=> {
                    this.onDeviceData(data)
                    
                })
                this.resetData();      
                this.stopped = false;    
                this.started = true;
                this.paused = false;

                return true;
            }    
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, protocol:this.getProtocolName()})
            throw new Error(`could not start device, reason:${err.message}`)

        }
    }

    async stop(): Promise<boolean> { 
        this.logger.logEvent({message: 'stop requested', protocol:this.getProtocolName()})
        this.device.reset();
        const stopped =this.device.disconnect();        
        if (stopped) {
            this.stopped = true;
            this.started = false;
            this.paused = false;
            return true
        }
        return false;
    }


}

export class BleControllableAdapter  extends BleAdapter implements Bike  {

    cyclingMode: CyclingMode;
    user?:User;

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) { 
        super(settings,props)
        this.cyclingMode = this.getDefaultCyclingMode()
        this.user = {}
    }

    setUser(user: User): void {
        this.user = user;
        if (!user.weight)
            this.user.weight = DEFAULT_USER_WEIGHT
    }


    setBikeProps(props:DeviceProperties) {

        const {user,userWeight,bikeWeight} = props||{}
        if (user) 
            this.setUser(user)
        if (userWeight)
            this.user.weight = userWeight

        const keys = Object.keys(props)
        keys.forEach( k=> {
            const p = props[k]
            if (p===null) 
                delete this.props[k]
            else if (p!==undefined)
                this.props[k] = p;
        })
    }

    getWeight():number {

        const {user={},props=DEFAULT_PROPS} = this;
        const userWeight = user.weight||props.userWeight||DEFAULT_USER_WEIGHT;
        const bikeWeight = props.bikeWeight ||DEFAULT_BIKE_WEIGHT;
        return userWeight+bikeWeight
    }


    getSupportedCyclingModes(): any[] {throw new Error('not implemented')}
    getDefaultCyclingMode(): CyclingMode {throw new Error('not implemented')}

    setCyclingMode(mode: CyclingMode|string, settings?:any):void  { 
        let selectedMode :CyclingMode;

        if ( typeof mode === 'string') {
            const supported = this.getSupportedCyclingModes();
            const CyclingModeClass = supported.find( M => { const m = new M(this); return m.getName() === mode })
            if (CyclingModeClass) {
                this.cyclingMode = new CyclingModeClass(this,settings);    
                return;
            }
            selectedMode = this.getDefaultCyclingMode();
        }
        else {
            selectedMode = mode;
        }
        
        this.cyclingMode = selectedMode;        
        this.cyclingMode.setSettings(settings);
    }

    getCyclingMode(): CyclingMode {
        if (!this.cyclingMode)
            this.setCyclingMode( this.getDefaultCyclingMode());
        return this.cyclingMode;

    }

}