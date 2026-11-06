import {EventLogger} from 'gd-eventlog';
import { BleDeviceData } from '../base/types.js';
import { LegacyProfile } from '../../antv2/types.js';
import BleAdapter from '../base/adapter.js';
import { BleOpenBikeControlSensor } from './sensor.js';
import { DeviceProperties, IAdapter, IncyclistAdapterData, IncyclistCapability } from '../../types/index.js';
import { BleDeviceSettings,  IBlePeripheral } from '../types.js';


export class OpenBikeControlAdapter extends BleAdapter<BleDeviceData,BleOpenBikeControlSensor>{  
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Controller'
    protected static CAPABILITIES:IncyclistCapability[] = [ IncyclistCapability.AppControl ]
    protected keyPressedHandler?: (event:any)=>void

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('OpenBikeControl')

        this.device = new BleOpenBikeControlSensor( this.getPeripheral() , {logger: this.logger})
        this.capabilities = OpenBikeControlAdapter.CAPABILITIES       
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

    isSame(adapter:IAdapter):boolean {
        if (!(adapter instanceof OpenBikeControlAdapter))
            return false;        
        
        return this.isEqual(adapter.settings as BleDeviceSettings)
    }

    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleOpenBikeControlSensor( peripheral, {logger:this.logger})
    }

   
    getProfile():LegacyProfile {
        return OpenBikeControlAdapter.INCYCLIST_PROFILE_NAME
    }

    getDisplayName() {
        return this.getName()        
    }

    mapData(deviceData:BleDeviceData): IncyclistAdapterData{        
        return {} // nothing requires mapping
    }


}
