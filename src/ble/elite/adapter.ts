import {EventLogger} from 'gd-eventlog';
import BleAdapter from '../base/adapter';
import BleEliteDevice from './comms';
import ICyclingMode from '../../modes/types';
import PowerMeterCyclingMode from '../../modes/power-meter';
import { PowerData } from '../cp';
import { IncyclistCapability } from '../../types/capabilities';
import { DeviceProperties,IncyclistAdapterData,IncyclistBikeData,ControllerConfig, IAdapter  } from '../../types';
import { BleDeviceSettings } from '../types';
import { BleEliteComms } from '.';
import { LegacyProfile } from '../../antv2/types';

/**
 * WORK IN PROGRESS --- DON'T USE YET
 * 
 *  Implementation needs to be based on https://github.com/WahooFitness/sensors-swift-trainers/blob/master/Source/EliteTrainerService.swift
 */


 
export default class BleEliteAdapter extends BleAdapter<PowerData,BleEliteDevice> {  
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'
    protected static controllers: ControllerConfig = {
        modes: [PowerMeterCyclingMode],
        default: PowerMeterCyclingMode
    }

    
    distanceInternal: number = 0;


    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('BLE-Elite')
        const {id,address,name} = settings
        const logger = this.logger
        const ble = this.ble

        this.device = new BleEliteDevice( {id,address,name,ble,logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]
    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof BleEliteAdapter))
            return false;
        
        return this.isEqual(device.settings as BleDeviceSettings)
    }
   
    getProfile():LegacyProfile {
        return 'Smart Trainer';
    }

    getName() {
        return `${this.device.name}`        
    }

    
    getDefaultCyclingMode(): ICyclingMode {
        return new PowerMeterCyclingMode(this);
    }

    getSupportedCyclingModes(): any[] {
        return [PowerMeterCyclingMode]
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
        } as IncyclistAdapterData;

        return data;
    }


    async start( props?: any ): Promise<any> {

        // TODO !!

        if ( this.ble.isScanning()) {
            this.logger.logEvent({message:'stop previous scan',isScanning:this.ble.isScanning()})
            await this.ble.stopScan();
        }

        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)
            

        const comms = this.device as BleEliteComms

        this.logger.logEvent({message: 'start requested', profile:this.getProfile(),props})
        try {
            
            if (comms) {
                
                comms.on('data', (data)=> {
                    this.onDeviceData(data)
                    
                })
                return true;
            }    
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, profile:this.getProfile()})
            throw new Error(`could not start device, reason:${err.message}`)

        }
    }
 
}

