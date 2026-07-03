import { SpeedSensorState, Profile, SpeedSensor } from "incyclist-ant-plus";
import AntAdapter from "../base/adapter.js";
import { LegacyProfile } from "../types.js";
import { ControllerConfig, IncyclistAdapterData, IncyclistBikeData, IncyclistCapability } from "../../types/index.js";
import ICyclingMode from "../../modes/types.js";
import SpeedCyclingMode from "../../modes/speed.js";

export default class AntSpdAdapter extends AntAdapter<SpeedSensorState>{   
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Speed Sensor'
    protected static ANT_PROFILE_NAME:Profile = 'SPD'
    protected static CAPABILITIES:IncyclistCapability[] = [ IncyclistCapability.Speed]
    protected static controllers: ControllerConfig = {
        modes: [SpeedCyclingMode],
        default: SpeedCyclingMode
    }
   
    mapToAdapterData(deviceData:SpeedSensorState) {
        if (deviceData.CalculatedSpeed!==undefined) {
            this.data.speed = deviceData.CalculatedSpeed*3.6;        
            this.data.timestamp = Date.now()
        }

        if (deviceData.CalculatedDistance!==undefined) {
            this.data.deviceDistanceCounter = deviceData.CalculatedDistance
        }
    }

    mapData( deviceData:SpeedSensorState): IncyclistBikeData {

        // update data based on information received from ANT+SPD sensor
        const data:IncyclistBikeData = {
            isPedalling: false,
            power: 0,
            pedalRpm: 0,
            speed: 0
        }

        data.speed    = (deviceData.CalculatedSpeed!==undefined? deviceData.CalculatedSpeed*3.6 :data.speed) ;
        data.time = (deviceData.SpeedEventTime!==undefined? deviceData.SpeedEventTime :data.time);

        data.isPedalling = data.speed>0
        return data;
    }

    transformData( bikeData:IncyclistBikeData): IncyclistAdapterData {
      
        if ( bikeData===undefined)
            return {};
   
        
        let data =  {
            speed: bikeData.speed,
            power: bikeData.power,
            timestamp: Date.now()
        } as IncyclistAdapterData;

        if (bikeData.time)
            data.deviceTime = bikeData.time

        this.data = data
        return data;
    }


    hasData():boolean {
        return this.deviceData.CalculatedSpeed!==undefined && this.deviceData.CalculatedSpeed!==null
    }

    setCyclingMode(mode: string | ICyclingMode, settings?: any, sendInitCommands?: boolean): void { 
        super.setCyclingMode(mode,settings,sendInitCommands)        


        // set wheel circumference (in m)
        try { 
            const sensor = this.sensor as SpeedSensor
            const wc = this.getCyclingMode().getSetting('wc')  // setting is in mm
            sensor.setWheelCircumference( wc / 1000)
        }
        catch { /*ignore */}
    }


}