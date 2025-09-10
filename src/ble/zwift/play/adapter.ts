import {EventLogger} from 'gd-eventlog';
import { BleDeviceData } from '../../base/types';
import { LegacyProfile } from '../../../antv2/types';
import BleAdapter from '../../base/adapter';
import { BleZwiftPlaySensor } from './sensor';
import { DeviceProperties, IAdapter, IncyclistAdapterData, IncyclistCapability } from '../../../types';
import { BleDeviceSettings, BleStartProperties, IBlePeripheral } from '../../types';


export class ZwiftPlayAdapter extends BleAdapter<BleDeviceData,BleZwiftPlaySensor>{  
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Controller'
    protected static CAPABILITIES:IncyclistCapability[] = [ IncyclistCapability.AppControl ]

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('ZwiftPlay')

        this.device = new BleZwiftPlaySensor( this.getPeripheral() , {logger: this.logger})
        this.capabilities = ZwiftPlayAdapter.CAPABILITIES       
    }

    protected async checkCapabilities():Promise<void> {
        return ;
    }

    start(startProps?: BleStartProperties): Promise<boolean> {
        return super.start(startProps)
    }

    async startSensor():Promise<boolean> {    
        try {
            let connected = await super.startSensor()

            if (connected) {
               const sensor = this.getSensor()

                // forward key-pressed events
                sensor.on('key-pressed', (event)=> {
                    this.emit('key-pressed',this.getSettings(), event)
                })
            }
            return connected
        }
        catch ( err)  {
            this.logEvent({message:'error', fn:'startSensor', error:err.message, stack:err.stack})
            return false
        }
    }

    

    isSame(adapter:IAdapter):boolean {
        if (!(adapter instanceof ZwiftPlayAdapter))
            return false;        
        return this.isEqual(adapter.settings as BleDeviceSettings)
    }

    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleZwiftPlaySensor( peripheral, {logger:this.logger})
    }

   
    getProfile():LegacyProfile {
        return ZwiftPlayAdapter.INCYCLIST_PROFILE_NAME
    }

    getDisplayName() {
        return this.getName()        
    }

    mapData(deviceData:BleDeviceData): IncyclistAdapterData{        
        return {} // nothing requires mapping
    }


}

