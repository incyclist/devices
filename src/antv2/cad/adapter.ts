import { CadenceSensorState, Profile } from "incyclist-ant-plus";
import AntAdapter from "../base/adapter";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import { IncyclistCapability } from "../../types";

export default class AntHrAdapter extends AntAdapter<CadenceSensorState>{   
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Cadence Sensor'
    protected static ANT_PROFILE_NAME:Profile = 'CAD'

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {
        super(settings, props)       
        this.capabilities = [ IncyclistCapability.Cadence]
    }
   
    mapToAdapterData(deviceData:CadenceSensorState) {
        if (deviceData.CalculatedCadence) {
            this.data.cadence = deviceData.CalculatedCadence;        
            this.data.timestamp = Date.now()
        }
    }

    hasData():boolean {
        return this.deviceData.CalculatedCadence!==undefined && this.deviceData.CalculatedCadence!==null
    }

}