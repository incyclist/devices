import {EventLogger} from 'gd-eventlog';
import { BleDeviceData } from '../../base/types.js';
import { LegacyProfile } from '../../../antv2/types.js';
import BleAdapter from '../../base/adapter.js';
import { BleZwiftPlaySensor } from './sensor.js';
import { DeviceProperties, IAdapter, IncyclistAdapterData, IncyclistCapability } from '../../../types/index.js';
import { BleDeviceSettings,  IBlePeripheral } from '../../types.js';


export class ZwiftPlayAdapter extends BleAdapter<BleDeviceData,BleZwiftPlaySensor>{  
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Controller'
    protected static CAPABILITIES:IncyclistCapability[] = [ IncyclistCapability.AppControl ]
    protected keyPressedHandler?: (event:any)=>void

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('ZwiftPlay')

        this.device = new BleZwiftPlaySensor( this.getPeripheral() , {logger: this.logger})
        this.capabilities = ZwiftPlayAdapter.CAPABILITIES       
    }

    protected async checkCapabilities():Promise<void> {
        return ;
    }


    async startSensor():Promise<boolean> {    
        try {
            let connected = await super.startSensor()

            if (connected) {
               const sensor = this.getSensor()

                // forward key-pressed events
                if (this.keyPressedHandler) {
                    sensor.off('key-pressed', this.keyPressedHandler)    
                }
                else {
                    this.keyPressedHandler = this.onKeyPressed.bind(this)
                }
                sensor.on('key-pressed', this.keyPressedHandler)
            }
            return connected
        }
        catch ( err:any)  {
            this.logEvent({message:'error', fn:'startSensor', error:err.message, stack:err.stack})
            return false
        }
    }

    protected onKeyPressed(event:any) {
        this.emit('key-pressed',this.getSettings(), event)                
    }

    isEqual(settings: BleDeviceSettings): boolean {
        const equal =  super.isEqual( settings) && 
            settings.address == (this.settings as BleDeviceSettings).address       

        return equal
    }
    

    isSame(adapter:IAdapter):boolean {
        if (!(adapter instanceof ZwiftPlayAdapter))
            return false;        
        
        return this.isEqual(adapter.settings as BleDeviceSettings) && this.getUniqueName()===adapter.getUniqueName()
    }

    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleZwiftPlaySensor( peripheral, {logger:this.logger})
    }

   
    getProfile():LegacyProfile {
        return ZwiftPlayAdapter.INCYCLIST_PROFILE_NAME
    }

    getUniqueName(): string {

        return this.getName()
    }


    getName(): string {
        
        const settings:BleDeviceSettings = this.settings as BleDeviceSettings
        let name = settings.name
        if (settings.name==='Zwift-Ride') {
            if (this.device.getDeviceType()==='ride-left') name = name + '-L'
            if (this.device.getDeviceType()==='ride-right') name = name + '-R'
        }
        const id = (settings.id ?? settings.address ?? '').replace(/[:\-]/g, '')
        const addressHash = id.length > 4 ? id.slice(-4).toUpperCase() : id.toUpperCase() 
        return `${name} ${addressHash}`
    }



    getDisplayName() {
        return this.getName()        
    }

    mapData(deviceData:BleDeviceData): IncyclistAdapterData{        
        return {} // nothing requires mapping
    }


}

