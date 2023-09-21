import { HeartRateSensorState, ISensor, Profile } from "incyclist-ant-plus";
import AntAdapter from "../adapter";
import {getBrand} from '../utils'
import { EventLogger } from "gd-eventlog";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import SensorFactory from "../sensor-factory";
import { IncyclistCapability } from "../../types/capabilities";

type HeartRateSensorData = {
    heartrate: number;
}

export default class AntHrAdapter extends AntAdapter<HeartRateSensorState, HeartRateSensorData>{
    
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
        } as HeartRateSensorState;
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

    getUniqueName(): string {
        if (this.settings.name)
            return this.settings.name

        const {DeviceID,ManId} = this.deviceData;
        const brand = getBrand(ManId)
        if (brand)
            return `${brand} HR ${DeviceID}`
        else 
            return `${this.getName()}`        
    }

    getDisplayName() {
        const {ComputedHeartRate} = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';

        return `${this.getUniqueName()}${hrmStr}`        
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
            if ( !this.canSendUpdate() )
                return;

            this.logEvent( {message:'onDeviceData',data:deviceData})
            if (this.paused)
                return;
            
            this.mapData(deviceData)            
            this.emitData(this.data)
        }
        catch ( err) {
        }
    }
   
    mapData(deviceData:HeartRateSensorState) {
        if (deviceData.ComputedHeartRate)
            this.data.heartrate = deviceData.ComputedHeartRate;
    }


    hasData():boolean {
        return this.deviceData.ComputedHeartRate!==undefined && this.deviceData.ComputedHeartRate!==null
    }

   


}