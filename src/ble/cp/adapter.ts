import {EventLogger} from 'gd-eventlog';
import CyclingMode from '../../modes/cycling-mode';

import PowerMeterCyclingMode from '../../modes/power-meter';
import { IncyclistBikeData } from '../../modes/cycling-mode';
import BleCyclingPowerDevice from './comm';
import { BleControllableAdapter }  from '../adapter';
import { DeviceProperties } from '../../types/device';
import { PowerData } from './types';
import { DeviceData } from '../../types/data';
import { BleDeviceSettings } from '../types';
import { IncyclistCapability } from '../../types/capabilities';
import IncyclistDevice from '../../base/adpater';

export default class PwrAdapter extends BleControllableAdapter {  

    distanceInternal: number = 0;

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('Ble-CP')

        const {id,address,name} = settings
        const logger = this.logger
        const ble = this.ble
        
        this.device = new BleCyclingPowerDevice( {id,address,name,logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Cadence, IncyclistCapability.Speed
        ]

        
    }

    isSame(device:IncyclistDevice):boolean {
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
    
    getDefaultCyclingMode(): CyclingMode {
        return new PowerMeterCyclingMode(this);
    }

    getSupportedCyclingModes(): any[] {
        return [PowerMeterCyclingMode]
    }


    onDeviceData(deviceData:PowerData):void {

        super.onDeviceData(deviceData)

        if (!this.started || this.paused || !this.hasDataListeners())
            return;       

        if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {

            this.logger.logEvent( {message:'onDeviceData',data:deviceData})        

            // transform data into internal structure of Cycling Modes
            let incyclistData = this.mapData(deviceData)              
            
            // let cycling mode process the data
            incyclistData = this.getCyclingMode().updateData(incyclistData);                    

            // transform data into structure expected by the application
            this.data =  this.transformData(incyclistData);                  

            this.emitData(this.data)
        }


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

