import { EventLogger } from 'gd-eventlog';
import BleAdapter from '../base/adapter';
import BleHrmDevice from './sensor';
import { IncyclistAdapterData,IncyclistCapability,IAdapter,DeviceProperties } from '../../types';
import { BleDeviceSettings, IBlePeripheral } from '../types';
import { HrmData } from './types';
import { LegacyProfile } from '../../antv2/types';


export default class HrmAdapter extends BleAdapter<HrmData,BleHrmDevice>{
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Heartrate Monitor'

    ignore: boolean = false;

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('Ble-HR')       

        this.device = new BleHrmDevice( this.getPeripheral(), {logger: this.logger} )
        this.capabilities = [ 
            IncyclistCapability.HeartRate
        ]

    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof HrmAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleHrmDevice( peripheral, {logger:this.logger})
    }



    getDisplayName() {
        const name = this.getName()
        const {heartrate:hrm} = this.deviceData;
        const hrmStr = hrm ? ` (${hrm})` : '';
        return `${name}${hrmStr}`
    }

    mapData(deviceData:HrmData):IncyclistAdapterData {
        const {heartrate} = deviceData
        return {heartrate}
    }

}
