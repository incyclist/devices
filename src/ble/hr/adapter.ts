import { EventLogger } from 'gd-eventlog';
import BleAdapter from '../adapter';
import { DeviceProperties } from '../../types/device';
import BleHrmDevice from './comm';
import { BleDeviceSettings } from '../types';
import { IncyclistCapability } from '../../types/capabilities';
import { HrmData } from './types';
import { DeviceData } from '../../types/data';


export default class HrmAdapter extends BleAdapter {
   
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

    isSame(device:BleAdapter):boolean {
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

    getPort():string {
        return 'ble' 
    }
    setIgnoreHrm(ignore) {
        this.ignore = ignore;
    }

    onDeviceData(deviceData:HrmData) {
        super.onDeviceData(deviceData)

        if (!this.started || this.paused || !this.onDataFn)
            return;       

        if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {

            this.logger.logEvent( {message:'onDeviceData',data:deviceData})        

            // transform data into structure expected by the application
            this.data =  this.mapData(this.deviceData)
            this.onDataFn(this.data)
            this.lastUpdate = Date.now();
        }
    
    }

    mapData(deviceData:HrmData):DeviceData {
        const {heartrate} = deviceData
        return {heartrate}
    }

}
