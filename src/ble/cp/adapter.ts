import {EventLogger} from 'gd-eventlog';
import { IncyclistBikeData } from '../../modes/types';
import BleCyclingPowerDevice from './comm';
import BleAdapter, { BlePowerControl } from '../base/adapter';
import { DeviceProperties } from '../../types/device';
import { PowerData } from './types';
import { DeviceData } from '../../types/data';
import {  BleDeviceSettings } from '../types';
import { IncyclistCapability } from '../../types/capabilities';
import { IncyclistDeviceAdapter } from '../../types/adapter';


export default class PwrAdapter extends BleAdapter<BlePowerControl> {  

    distanceInternal: number = 0;

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.setControl( new BlePowerControl(this, props))
        this.logger = new EventLogger('Ble-CP')

        const {id,address,name} = settings
        const logger = this.logger
        
        
        this.device = new BleCyclingPowerDevice( {id,address,name,logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Cadence, IncyclistCapability.Speed
        ]

        
    }

    isSame(device:IncyclistDeviceAdapter):boolean {
        if (!(device instanceof PwrAdapter))
            return false;        
        return this.isEqual(device.settings as BleDeviceSettings)
    }
   
    getProfile() {
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

    transformData( bikeData:IncyclistBikeData): DeviceData {
       
        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance = Math.round(bikeData.distanceInternal-this.distanceInternal)
        }

        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        
        let data =  {
            speed: bikeData.speed,
            slope: bikeData.slope,
            power: bikeData.power!==undefined ? Math.round(bikeData.power) : undefined,
            cadence: bikeData.pedalRpm!==undefined ? Math.round(bikeData.pedalRpm) : undefined,
            distance,
            timestamp: Date.now()
        } as DeviceData;

        return data;
    }


    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused)
            return;

        // nothing required to be sent to the device, but calling the Cycling Mode to adjust slope
        this.getCyclingMode().sendBikeUpdate(request)        
    } 

    async stop():Promise<boolean> {
        const stopped = await super.stop();
        if (stopped)
            this.distanceInternal = 0;
        return stopped;

    }

}

