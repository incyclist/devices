import { HeartRateSensorState, Profile } from "incyclist-ant-plus";
import AntAdapter from "../base/adapter";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import { IncyclistCapability } from "../../types";

export default class AntHrAdapter extends AntAdapter<HeartRateSensorState>{   
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Heartrate Monitor'
    protected static ANT_PROFILE_NAME:Profile = 'HR'

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {
        super(settings, props)       
        this.capabilities = [ IncyclistCapability.HeartRate]
    }

    getDisplayName() {
        const {ComputedHeartRate} = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';

        return `${this.getUniqueName()}${hrmStr}`        
    }

   
    mapToAdapterData(deviceData:HeartRateSensorState) {
        if (deviceData.ComputedHeartRate) {
            this.data.heartrate = deviceData.ComputedHeartRate;        
            this.data.timestamp = Date.now()
        }
    }

    hasData():boolean {
        return this.deviceData.ComputedHeartRate!==undefined && this.deviceData.ComputedHeartRate!==null
    }

}