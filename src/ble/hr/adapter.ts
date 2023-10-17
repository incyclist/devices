import { EventLogger } from 'gd-eventlog';
import BleAdapter from '../base/adapter';
import BleHrmDevice from './comm';
import { IncyclistAdapterData,IncyclistCapability,IAdapter,DeviceProperties } from '../../types';
import { BleDeviceSettings } from '../types';
import { HrmData } from './types';
import { LegacyProfile } from '../../antv2/types';


export default class HrmAdapter extends BleAdapter<HrmData,BleHrmDevice>{
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Heartrate Monitor'

    ignore: boolean = false;

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('Ble-HR')       

        const {id,address,name} = settings
        const logger = this.logger
        const ble = this.ble

        this.device = new BleHrmDevice( {id,address,name,ble,logger})
        this.capabilities = [ 
            IncyclistCapability.HeartRate
        ]

    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof HrmAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

  

    getName() {
        return `${this.device.name}`        
    }

    getDisplayName() {
        const {name} = this.device;
        const {heartrate:hrm} = this.deviceData;
        const hrmStr = hrm ? ` (${hrm})` : '';
        return `${name}${hrmStr}`
    }

    mapData(deviceData:HrmData):IncyclistAdapterData {
        const {heartrate} = deviceData
        return {heartrate}
    }

}
