import { EventLogger } from 'gd-eventlog';
import BleAdapter from '../base/adapter';
import { DeviceProperties } from '../../types/device';
import BleHrmDevice from './comm';
import { BleDeviceProperties, BleDeviceSettings } from '../types';
import { IncyclistCapability } from '../../types/capabilities';
import { HrmData } from './types';
import { DeviceData } from '../../types/data';
import { NonControllableDevice } from '../../base/adpater';
import { IncyclistDeviceAdapter } from '../../types/adapter';


export default class HrmAdapter extends BleAdapter<NonControllableDevice<BleDeviceProperties>> {
   
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

    isSame(device:IncyclistDeviceAdapter):boolean {
        if (!(device instanceof HrmAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

   
    getProfile() {
        return 'Heartrate Monitor';
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

    mapData(deviceData:HrmData):DeviceData {
        const {heartrate} = deviceData
        return {heartrate}
    }

}
