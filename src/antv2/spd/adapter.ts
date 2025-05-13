import { SpeedSensorState, Profile } from "incyclist-ant-plus";
import AntAdapter from "../base/adapter";
import { LegacyProfile } from "../types";
import { IncyclistCapability } from "../../types";

export default class AntSpdAdapter extends AntAdapter<SpeedSensorState>{   
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Speed Sensor'
    protected static ANT_PROFILE_NAME:Profile = 'SPD'
    protected static CAPABILITIES:IncyclistCapability[] = [ IncyclistCapability.Speed]
   
    mapToAdapterData(deviceData:SpeedSensorState) {
        if (deviceData.CalculatedSpeed!==undefined) {
            this.data.speed = deviceData.CalculatedSpeed*3.6;        
            this.data.timestamp = Date.now()
        }

        if (deviceData.CalculatedDistance!==undefined) {
            this.data.deviceDistanceCounter = deviceData.CalculatedDistance
        }
    }

    hasData():boolean {
        return this.deviceData.CalculatedSpeed!==undefined && this.deviceData.CalculatedSpeed!==null
    }

}