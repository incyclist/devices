import {EventLogger} from 'gd-eventlog';
import BleCyclingPowerDevice from './comm';
import BleAdapter from '../base/adapter';
import { PowerData } from './types';
import {  BleDeviceSettings } from '../types';
import { DeviceProperties,IncyclistBikeData,IncyclistAdapterData,IncyclistCapability, ControllerConfig, IAdapter  } from '../../types';
import PowerMeterCyclingMode from '../../modes/power-meter';
import { LegacyProfile } from '../../antv2/types';


export default class PwrAdapter extends BleAdapter<PowerData,BleCyclingPowerDevice>{  
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Power Meter'
    protected static controllers: ControllerConfig = {
        modes: [PowerMeterCyclingMode],
        default: PowerMeterCyclingMode
    }
    distanceInternal: number = 0;

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('Ble-CP')

        const {id,address,name} = settings
        const logger = this.logger
        
        
        this.device = new BleCyclingPowerDevice( {id,address,name,logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Cadence, IncyclistCapability.Speed
        ]

        
    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof PwrAdapter))
            return false;        
        return this.isEqual(device.settings as BleDeviceSettings)
    }
   
    getProfile():LegacyProfile {
        return 'Power Meter';
    }

    getName() {
        return `${this.device.name}`        
    }

    getDisplayName() {
        const {name} = this.device;
        const {instantaneousPower: power} = this.deviceData;
        const powerStr = power ? ` (${power})` : '';
        return `${name}${powerStr}`
    }


    mapData(deviceData:PowerData): IncyclistBikeData{
        // update data based on information received from ANT+PWR sensor
        const data = {
            isPedalling: false,
            power: 0,
            pedalRpm: undefined,
            speed: 0,
            heartrate:0,
            distanceInternal:0,        // Total Distance in meters             
            slope:undefined,
            time:undefined
        }

        data.power = (deviceData.instantaneousPower!==undefined? deviceData.instantaneousPower :data.power);
        data.pedalRpm = (deviceData.rpm!==undefined? deviceData.rpm :data.pedalRpm) ;
        data.time = (deviceData.time!==undefined? deviceData.time :data.time);
        data.isPedalling = data.pedalRpm>0 || (data.pedalRpm===undefined && data.power>0);
        return data;
    }

    transformData( bikeData:IncyclistBikeData): IncyclistAdapterData {
       
        if ( bikeData===undefined)
            return;
   
        
        let data =  {
            speed: bikeData.speed,
            power: bikeData.power,
            cadence: bikeData.pedalRpm,
            timestamp: Date.now()
        } as IncyclistAdapterData;

        if (bikeData.time)
            data.deviceTime = bikeData.time

        this.data = data
        return data;
    }

    async stop():Promise<boolean> {
        const stopped = await super.stop();
        if (stopped)
            this.distanceInternal = 0;
        return stopped;

    }

    // just implemented based on the assumption, that the lack was somehow causing a crash ("Method not implemented")
    sendUpdate(request: any): void {
        try {
            super.sendUpdate(request)
        }
        catch(err) {
            this.logEvent({message:'Error',fn:'sendUpdate',error:err.message })
        }
        
    }

}

