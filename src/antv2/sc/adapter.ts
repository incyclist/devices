import { SpeedCadenceSensorState, Profile } from "incyclist-ant-plus";
import AntAdapter from "../base/adapter.js";
import { LegacyProfile } from "../types.js";
import { IncyclistCapability } from "../../types/index.js";

export default class AntSpdAdapter extends AntAdapter<SpeedCadenceSensorState>{   
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Speed + Cadence Sensor'
    protected static ANT_PROFILE_NAME:Profile = 'SC'
    protected static CAPABILITIES:IncyclistCapability[] = [ IncyclistCapability.Speed, IncyclistCapability.Cadence]
   
    mapToAdapterData(deviceData:SpeedCadenceSensorState) {
        if (deviceData.CalculatedSpeed!==undefined) {
            this.data.speed = deviceData.CalculatedSpeed*3.6;        
            this.data.timestamp = Date.now()
        }

        if (deviceData.CalculatedDistance!==undefined) {
            this.data.deviceDistanceCounter = deviceData.CalculatedDistance
        }

        if (deviceData.CalculatedCadence) {
            this.data.cadence = deviceData.CalculatedCadence;        
            this.data.timestamp = Date.now()
        }

    }

    hasData():boolean {
        return ( (this.deviceData.CalculatedSpeed!==undefined && this.deviceData.CalculatedSpeed!==null) || 
            (this.deviceData.CalculatedCadence!==undefined && this.deviceData.CalculatedCadence!==null))
    }

}