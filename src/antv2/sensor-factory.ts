import { ISensor, Profile } from "incyclist-ant-plus";

import {BicyclePowerSensor, HeartRateSensor, FitnessEquipmentSensor} from "incyclist-ant-plus";

const profiles = [
    {profile: 'PWR', Class: BicyclePowerSensor}, 
    {profile: 'HR', Class: HeartRateSensor}, 
    {profile: 'FE', Class: FitnessEquipmentSensor}, 
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