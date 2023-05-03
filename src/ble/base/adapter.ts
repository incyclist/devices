
import IncyclistDevice,{ DEFAULT_BIKE_WEIGHT, DEFAULT_PROPS, DEFAULT_USER_WEIGHT } from "../../base/adpater";
import CyclingMode, { IncyclistBikeData } from "../../modes/cycling-mode";
import { Bike } from "../../types/adapter";
import { DeviceData } from "../../types/data";
import { DeviceProperties } from "../../types/device";
import { User } from "../../types/user";
import { BleComms } from "./comms";
import BleInterface from "../ble-interface";
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties } from "../types";

const INTERFACE_NAME = 'ble'

export default class BleAdapter  extends IncyclistDevice  { 

    ble: BleInterface
    deviceData: any
    data: DeviceData
    dataMsgCount: number
    lastDataTS: number;
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


    getUniqueName(): string {
        const settings:BleDeviceSettings = this.settings as BleDeviceSettings

        if (settings.name.match(/[0-9]/g) || settings.address===undefined)      
            return this.settings.name
        else {
            const addressHash = settings.address.substring(0,2) + settings.address.slice(-2)
            return `${this.getName()} ${addressHash}`
        }
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
        }
        catch(err) {
            this.logEvent({message:'error',fn:'connect()',error:err.message, stack:err.stack})            
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
    
        if (!this.started ||!this.canSendUpdate())
            return;       

        this.logEvent( {message:'onDeviceData',data:deviceData, isControllable:(this instanceof BleControllableAdapter)})        

        if (this instanceof BleControllableAdapter) {
            
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

    mapData(deviceData:any):DeviceData|IncyclistBikeData {
        throw new Error('message not implemented')    
    }

    transformData( data:IncyclistBikeData): DeviceData {
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


    async start( props: BleStartProperties={} ): Promise<any> {

        if (this.started)
            return true;

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

    async pause(): Promise<boolean> {
        const res = await super.pause()    
        this.getComms()?.pause()
        return res;
    }

    async resume(): Promise<boolean> {
        const res = await super.resume()    
        this.getComms()?.resume()
        return res;
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

    isControllable(): boolean {
        return true;
    }


    setBikeProps(props:DeviceProperties) {

        const {user,userWeight} = props||{}
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

    async sendInitCommands():Promise<boolean> {
        return true;
    }


    getCyclingMode(): CyclingMode {
        if (!this.cyclingMode)
            this.setCyclingMode( this.getDefaultCyclingMode());
        return this.cyclingMode;

    }

}