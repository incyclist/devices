import { HeartRateSensorState, ISensor, Profile } from "incyclist-ant-plus";
import AntAdapter from "../adapter";
import {getBrand} from '../utils'
import { EventLogger } from "gd-eventlog";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import SensorFactory from "../sensor-factory";
import { IncyclistCapability } from "../../types/capabilities";


export default class AntHrAdapter extends AntAdapter{
    
    static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Heartrate Monitor'
    static ANT_PROFILE_NAME:Profile = 'HR'

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {

        // check against legacy settings (using protocol and Incyclist profile name)
        if (settings.protocol && settings.profile!==AntHrAdapter.INCYCLIST_PROFILE_NAME)
            throw new Error('Incorrect Profile')
        // check against new settings (not using protocol and and using ANT profile name)
        if (!settings.protocol && settings.profile!==AntHrAdapter.ANT_PROFILE_NAME)
            throw new Error('Incorrect Profile')

        super(settings, props)

        
        this.deviceData = {
            DeviceID: this.sensor.getDeviceID()
        }       
        this.logger = new EventLogger('Ant+Hrm')
        this.capabilities = [ IncyclistCapability.HeartRate]
    }

    createSensor(settings:AntDeviceSettings):ISensor {
        return SensorFactory.create(AntHrAdapter.ANT_PROFILE_NAME, Number(settings.deviceID)) 
    }

    getName() {
        if (this.settings.name)
            return this.settings.name
        const deviceID = this.sensor.getDeviceID();
        return `Ant+HR ${deviceID}`        

    }

    getDisplayName() {
        const {DeviceID,ManId,ComputedHeartRate} = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';
        const brand = getBrand(ManId)
        if (brand)
            return `${brand} Hrm ${DeviceID}${hrmStr}`
        else 
            return `${this.getName()}${hrmStr}`
    }

    onDeviceData(deviceData:HeartRateSensorState) {
        this.dataMsgCount++;
        this.lastDataTS = Date.now();

        super.onDeviceData(deviceData)

        if (!this.started)
            return;

        if (!this.ivDataTimeout) 
            this.startDataTimeoutCheck()

        try {
            if ( this.onDataFn && !this.paused) {
                if ( this.lastUpdate===undefined || (Date.now()-this.lastUpdate)>this.updateFrequency) {
                    this.logEvent( {message:'onDeviceData',data:deviceData})


                    const data = this.updateData(this.data,deviceData)
                    this.onDataFn(data)
                    this.lastUpdate = Date.now();
                }
            }    
        }
        catch ( err) {
        }
    }
   

    updateData( data,deviceData) {
        data.heartrate = deviceData.ComputedHeartRate;
        return data;
    }

    hasData():boolean {
        return this.deviceData.ComputedHeartRate!==undefined && this.deviceData.ComputedHeartRate!==null
    }

   


}