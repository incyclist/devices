import { BicyclePowerSensorState, ISensor, Profile } from "incyclist-ant-plus";
import { ControllableAntAdapter } from "../adapter";
import {getBrand} from '../utils'
import { EventLogger } from "gd-eventlog";
import CyclingMode, { IncyclistBikeData } from '../../modes/cycling-mode';
import PowerMeterCyclingMode from "../../modes/power-meter";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import SensorFactory from "../sensor-factory";
import { IncyclistCapability } from "../../types/capabilities";

type PowerSensorData = {
    speed: number;
    slope: number;
    power: number;
    cadence: number;
    distance: number;
    timestamp: number;
}

export default class AntPwrAdapter extends ControllableAntAdapter<BicyclePowerSensorState, PowerSensorData> {

    static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Power Meter'
    static ANT_PROFILE_NAME:Profile = 'PWR'

    protected distanceInternal?: number;

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {

        // check against legacy settings (using protocol and Incyclist profile name)
        if (settings.protocol && settings.profile!==AntPwrAdapter.INCYCLIST_PROFILE_NAME)
            throw new Error('Incorrect Profile')
        // check against new settings (not using protocol and and using ANT profile name)
        if (!settings.protocol && settings.profile!==AntPwrAdapter.ANT_PROFILE_NAME)
            throw new Error('Incorrect Profile')

        super(settings, props)

        this.deviceData = {
            DeviceID: this.sensor.getDeviceID()
        } as BicyclePowerSensorState;
        this.logger = new EventLogger('Ant+PWR')
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Cadence, IncyclistCapability.Speed
        ]
    }

    createSensor(settings:AntDeviceSettings):ISensor {
        return SensorFactory.create(AntPwrAdapter.ANT_PROFILE_NAME, Number(settings.deviceID)) 
    }

    getName() {
        if (this.settings.name)
            return this.settings.name
        const deviceID = this.sensor.getDeviceID();
        return `Ant+PWR ${deviceID}`        
    }

    getUniqueName(): string {
        if (this.settings.name)
            return this.settings.name

        const {DeviceID,ManId} = this.deviceData;
        const brand = getBrand(ManId)
        if (brand)
            return `${brand} PWR ${DeviceID}`
        else 
            return `${this.getName()}`        
    }

    getDisplayName() {
        const {Power} = this.deviceData;
        const pwrStr = Power ? ` (${Power})` : '';
        return `${this.getUniqueName()}${pwrStr}`        
    }

    getDefaultCyclingMode(): CyclingMode {
        return new PowerMeterCyclingMode(this);
    }

    getSupportedCyclingModes(): any[] {
        return [PowerMeterCyclingMode]
    }

    getLogData(data, excludeList) {
        
        const logData  = JSON.parse(JSON.stringify(data));
        excludeList.forEach( (key) => {
            delete logData[key] })
        return logData;
    }

    onDeviceData(deviceData) {
        this.dataMsgCount++;
        this.lastDataTS = Date.now();

        super.onDeviceData(deviceData)

        if (!this.started)
            return;


        if (!this.ivDataTimeout) 
            this.startDataTimeoutCheck()

        
        try {
            if ( !this.canSendUpdate()) 
                return;
                
            const logData = this.getLogData(deviceData, ['PairedDevices','RawData']);
            this.logger.logEvent( {message:'onDeviceData',data:logData})


            // transform data into internal structure of Cycling Modes
            let incyclistData = this.mapData(deviceData)              
            
            // let cycling mode process the data
            incyclistData = this.getCyclingMode().updateData(incyclistData);                    

            // transform data into structure expected by the application
            const data =  this.transformData(incyclistData);
            this.emitData(data)
 
        }
        catch ( err) {
        }    
    }

    canSendUpdate(): boolean {
        if (!this.hasDataListeners() || this.paused) return false;
        return super.canSendUpdate()
    }


    sendUpdate(request) {
        if( this.isPaused())
            return

        // nothing required to be sent to the device, but calling the Cycling Mode to adjust slope
        this.getCyclingMode().sendBikeUpdate(request) 
    }   

    mapData( deviceData): IncyclistBikeData {

        // update data based on information received from ANT+PWR sensor
        const data = {
                isPedalling: false,
                power: 0,
                pedalRpm: 0,
                speed: 0,
                heartrate:0,
                distanceInternal:0,        // Total Distance in meters             
                slope:undefined,
                time:undefined
        }

        data.slope = (deviceData.Slope!==undefined? deviceData.Slope :data.slope);
        data.power = (deviceData.Power!==undefined? deviceData.Power :data.power);
        data.pedalRpm = (deviceData.Cadence!==undefined? deviceData.Cadence :data.pedalRpm) ;
        data.time = (deviceData.TimeStamp!==undefined? deviceData.TimeStamp :data.time);
        data.isPedalling = data.pedalRpm>0;


        return data;
    }


    transformData( bikeData:IncyclistBikeData): PowerSensorData {
        
        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance = bikeData.distanceInternal-this.distanceInternal
        }
        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        

        const data: PowerSensorData = {
            speed: bikeData.speed,
            slope: bikeData.slope,
            power: bikeData.power,
            cadence: bikeData.pedalRpm,
            distance,
            timestamp: Date.now()
        } 

        return data;
    }

    hasData():boolean {
        const {Power,Cadence,TimeStamp} = this.deviceData

        const hasData = (Power!==undefined && Power!==null) ||  (Cadence!==undefined && Cadence!==null) || (TimeStamp!==undefined && TimeStamp!==null)
        return hasData
    }

    
    async start( props?: any ): Promise<any> {
        const wasPaused = this.paused 
     
        if (wasPaused)
            this.resume()

        if (this.started && !wasPaused) {
            return true;
        }
    
        return await super.start(props)

    }
    


}