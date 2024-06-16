import { BicyclePowerSensorState,  Profile } from "incyclist-ant-plus";
import AntAdapter from "../base/adapter";
import PowerMeterCyclingMode from "../../modes/power-meter";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import { IncyclistCapability,ControllerConfig,IncyclistBikeData, IncyclistAdapterData } from "../../types";
import { UpdateRequest } from "../../modes/types";

export default class AntPwrAdapter extends AntAdapter<BicyclePowerSensorState> {

    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Power Meter'
    protected static ANT_PROFILE_NAME:Profile = 'PWR'
    protected static controllers: ControllerConfig = {
        modes: [PowerMeterCyclingMode],
        default:PowerMeterCyclingMode
    }

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {
        super(settings, props)       
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Cadence, IncyclistCapability.Speed
        ]
    }

    mapData( deviceData:BicyclePowerSensorState): IncyclistBikeData {

        // update data based on information received from ANT+PWR sensor
        const data:IncyclistBikeData = {
            isPedalling: false,
            power: 0,
            pedalRpm: 0,
            speed: 0
        }

        data.power = (deviceData.Power!==undefined? deviceData.Power :data.power);
        data.pedalRpm = (deviceData.Cadence!==undefined? deviceData.Cadence :data.pedalRpm) ;
        data.time = (deviceData.TimeStamp!==undefined? deviceData.TimeStamp :data.time);

        if (deviceData.CalculatedPower!==undefined && deviceData.Power===undefined)
            data.power = deviceData.CalculatedPower
        if (deviceData.CalculatedCadence!==undefined && deviceData.Cadence===undefined)
            data.pedalRpm = deviceData.CalculatedCadence

        data.isPedalling = data.pedalRpm>0 || data.power>0
        return data;
    }


    transformData( bikeData:IncyclistBikeData): void {
        
        const data: IncyclistAdapterData = {            
            power: bikeData.power,
            cadence: bikeData.pedalRpm,
            speed: bikeData.speed,
            timestamp: Date.now()
        }         

        if (bikeData.time)
            data.deviceTime = bikeData.time

        this.data = data
        
    }

    hasData():boolean {
        const {Power,CalculatedPower, CalculatedCadence,Cadence} = this.deviceData

        const has = v => (v!==undefined && v!==null)

        const hasData = has(Power) || has(CalculatedPower) || has(Cadence) || has(CalculatedCadence)
        return hasData
    } 

    async sendUpdate(request: any): Promise<UpdateRequest|void> {
        try {
            if ( (this.isPaused() || this.isStopped()) && !request.forced)
                return;

            return await this.getCyclingMode().sendBikeUpdate(request) 
            
        }
        catch(err) {
             this.logEvent({message:'Error',fn:'sendUpdate',error:err.message })
        }       
    }


}