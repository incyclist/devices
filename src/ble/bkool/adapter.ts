import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter} from '../fm/index.js';
import BleBkoolDevice from './sensor.js';
import { BleDeviceProperties, BleDeviceSettings, IBlePeripheral } from '../types.js';
import { IncyclistCapability,IAdapter } from '../../types/index.js';
import { LegacyProfile } from '../../antv2/types.js';

export default class BleBkoolAdapter extends BleFmAdapter {
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'

    constructor( settings:BleDeviceSettings, props?:BleDeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('BLE-BkoolFM')

        this.device = new BleBkoolDevice( this.getPeripheral(), {logger:this.logger})
        this.capabilities = [
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence,
            IncyclistCapability.Control
        ]

    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof BleBkoolAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

    getProfile():LegacyProfile {
        return 'Smart Trainer';
    }

    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleBkoolDevice( peripheral, {logger:this.logger})
    }

    protected async checkCapabilities() {
        this.logEvent({message:'device capabilities updated', name:this.getSettings().name, interface:this.getSettings().interface,capabilities: this.capabilities})
    }

}
