
import AntProtocol, { AntDeviceSettings, mapIncyclistProfile } from "./incyclist-protocol";
import AntAdapter from "./ant-device";
import AntFEAdapter from "./fe";
import AntHrAdapter from "./hr";
import AntPwrAdapter from "./pwr";
import SensorFactory from "./sensor-factory";
import { settings } from "cluster";


const profiles = [
    {profile: 'PWR', Class:AntPwrAdapter}, 
    {profile: 'HR', Class: AntHrAdapter}, 
    {profile: 'FE', Class: AntFEAdapter}, 
]


export default class AdapterFactory {

    static create ( settings: { configuration?:AntDeviceSettings, detected?:{ profile:string, deviceID:number }}, protocol: AntProtocol) : AntAdapter {

        let profile;
        let deviceID;

        if (settings && settings.configuration) {
            profile = mapIncyclistProfile(settings.configuration.profile)
            deviceID = settings.configuration.deviceID
        }
        else if (settings && settings.detected) {
            profile = settings.detected.profile;
            deviceID = settings.detected.deviceID
        }
        else {
            return;
        }

        const sensor = SensorFactory.create(profile,Number(deviceID))
        if (sensor) {
            const info = profiles.find( i => i.profile===profile) 
            if (!info)
                return;

            return new info.Class(sensor,protocol)
        }        
    }
}