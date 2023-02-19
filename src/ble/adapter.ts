
import IncyclistDevice,{ DEFAULT_BIKE_WEIGHT, DEFAULT_PROPS, DEFAULT_USER_WEIGHT } from "../base/adpater";
import CyclingMode from "../modes/cycling-mode";
import { Bike } from "../types/adapter";
import { DeviceData } from "../types/data";
import { DeviceProperties } from "../types/device";
import { User } from "../types/user";
import { BleComms } from "./ble-comms";
import BleInterface from "./ble-interface";
import { BleDeviceSettings } from "./types";

const INTERFACE_NAME = 'ble'


export default class BleAdapter  extends IncyclistDevice  { 

    ble: BleInterface
    deviceData: any
    data: DeviceData
    dataMsgCount: number
    lastUpdate?: number;
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

    isEqual(settings: BleDeviceSettings): boolean {
        const as = this.settings as BleDeviceSettings;

        if (as.interface!==settings.interface)
            return false;

        if (as.protocol==='BLE' || settings.protocol==='BLE')  { // legacy
            return (as.protocol===settings.protocol && as.profile===settings.profile && as.name===settings.name)
        }
        else {
            return (as.protocol===settings.protocol && (as.name===settings.name || as.address===settings.address || as.id===settings.id)  ) 
        }

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


    async start( props: DeviceProperties={} ): Promise<any> {
        if (this.started)
            return true;

        this.logger.logEvent({message: 'start requested', protocol:this.getProtocolName(),props})
        try {
            const bleDevice = await this.ble.connectDevice(this.device) 
            if (bleDevice) {
                this.device = bleDevice;
                bleDevice.on('data', (data)=> {
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