import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter} from '../fm/index.js';
import BleWahooDevice from './sensor.js';
import { BleDeviceProperties, BleDeviceSettings, IBlePeripheral } from '../types.js';
import { IncyclistCapability,IAdapter, IncyclistBikeData } from '../../types/index.js';
import { LegacyProfile } from '../../antv2/types.js';
import calc from '../../utils/calculations.js'
import { IndoorBikeData } from './types.js';

export default class BleWahooAdapter extends BleFmAdapter {
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'
    
   
    constructor( settings:BleDeviceSettings, props?:BleDeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('BLE-WahooFM')

        this.device = new BleWahooDevice( this.getPeripheral(), {logger:this.logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]

    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof BleWahooAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

   
    getProfile():LegacyProfile {
        return 'Smart Trainer';
    }


    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleWahooDevice( peripheral, {logger:this.logger})
    }

    mapData(deviceData:IndoorBikeData): IncyclistBikeData{

        const data = super.mapData(deviceData)

        // some wahoo  (seen on SNAP) devices don't deliver a power value if power is too low
        // as they also don't deliver cadence, we can't know that the user is still pedaling
        // Thus, if speed>0, but no power and no cadence, we overwrite pedalling flag based on speed

        
        if (!deviceData.instantaneousPower && !deviceData.cadence && (deviceData.speed??0)>0) {
            const m = this.getWeight()
            data.isPedalling = true
            data.power = calc.calculatePower(m,data.speed/3.6, 0)
        }

        return data;
    }


    protected async checkCapabilities() { 
        this.logEvent({message:'device capabilities updated', name:this.getSettings().name, interface:this.getSettings().interface,capabilities: this.capabilities})    
    }



}

