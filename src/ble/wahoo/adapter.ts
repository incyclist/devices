import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter} from '../fm';
import BleWahooDevice from './sensor';
import { BleDeviceProperties, BleDeviceSettings, IBlePeripheral } from '../types';
import { IncyclistCapability,IAdapter } from '../../types';
import { LegacyProfile } from '../../antv2/types';


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



}

