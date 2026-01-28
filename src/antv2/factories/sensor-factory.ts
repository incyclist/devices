/* istanbul ignore file */

import { CadenceSensor, ISensor, Profile, SpeedCadenceSensor, SpeedSensor, 
         BicyclePowerSensor, HeartRateSensor, FitnessEquipmentSensor} from "incyclist-ant-plus";

const profiles = [
    {profile: 'PWR', Class: BicyclePowerSensor}, 
    {profile: 'HR', Class: HeartRateSensor}, 
    {profile: 'FE', Class: FitnessEquipmentSensor}, 
    {profile: 'CAD', Class: CadenceSensor}, 
    {profile: 'SPD', Class: SpeedSensor}, 
    {profile: 'SC', Class: SpeedCadenceSensor}, 
]

export default class SensorFactory {

    static create ( profile:Profile, deviceID?:number) : ISensor {
        const info = profiles.find( i => i.profile===profile) 
        if (!info)
            return;

        return new info.Class(deviceID)
    }

    static createAll(): ISensor[] {
        return profiles.map( info => new info.Class())
    }
}