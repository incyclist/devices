import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter} from '../fm/index.js';
import BleBkoolDevice from './sensor.js';
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../../base/consts.js";
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties, IBlePeripheral } from '../types.js';
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

    // Bkool has no RequestControl handshake to establish (BleBkoolDevice.requestControl() is a
    // trivial no-op), so this bypasses BleFmAdapter's generic establishControl()/
    // attemptStartRequest() entirely and instead sends the real FE-C init pages once, using this
    // ride's actual user/bike weight and wheel size - mirrors ble/tacx/adapter.ts's own
    // initControl() override exactly (same protocol family, same reasoning).
    protected async initControl(props?:BleStartProperties) {
        const sensor = this.getSensor() as BleBkoolDevice

        const {user, wheelDiameter, gearRatio, bikeWeight=DEFAULT_BIKE_WEIGHT} = props || {}
        const userWeight = user?.weight ?? DEFAULT_USER_WEIGHT

        await sensor.sendBasicResistance(0)
        await sensor.sendWindResistance(sensor.getCw(), sensor.getWindSpeed(), 0)
        await sensor.sendTrackResistance(0, sensor.getCrr())
        await sensor.sendUserConfiguration(userWeight, bikeWeight, wheelDiameter, gearRatio)

        const startRequest = this.getCyclingMode().getBikeInitRequest()
        await this.sendUpdate(startRequest)
    }

    protected async checkCapabilities() {
        this.logEvent({message:'device capabilities updated', name:this.getSettings().name, interface:this.getSettings().interface,capabilities: this.capabilities})
    }

}
