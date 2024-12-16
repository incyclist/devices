import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter} from '../fm';
import TacxAdvancedFitnessMachineDevice from './sensor';
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../../base/consts";
import { BleDeviceSettings, BleStartProperties, IBlePeripheral } from '../types';
import { DeviceProperties,IncyclistCapability,IAdapter } from '../../types';
import { LegacyProfile } from '../../antv2/types';



export default class BleTacxAdapter extends BleFmAdapter {
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {

        super(settings,props);

        this.logger = new EventLogger('BLE-FEC-Tacx')

        this.device = new TacxAdvancedFitnessMachineDevice( this.getPeripheral(),{logger:this.logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]
    
        
    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof BleTacxAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

    updateSensor(peripheral:IBlePeripheral) {
        this.device = new TacxAdvancedFitnessMachineDevice( peripheral, {logger:this.logger})
    }

    getProfile():LegacyProfile {
        return 'Smart Trainer'
    }


    protected async initialize(props?:BleStartProperties) {
        const sensor = this.getComms() as TacxAdvancedFitnessMachineDevice

        const {user, wheelDiameter, gearRatio,bikeWeight=DEFAULT_BIKE_WEIGHT} = props || {}
        const userWeight = (user?.weight ?? DEFAULT_USER_WEIGHT);
        

        sensor.sendTrackResistance(0.0);
        sensor.sendUserConfiguration( userWeight, bikeWeight, wheelDiameter, gearRatio);

        const startRequest = this.getCyclingMode().getBikeInitRequest()
        await this.sendUpdate(startRequest);

    }

    protected checkForAdditionalCapabilities() {
        const before = this.capabilities.join(',')
        const sensor = this.getComms()

        if (sensor.features && sensor.features.heartrate && !this.hasCapability(IncyclistCapability.HeartRate)) {
            this.capabilities.push(IncyclistCapability.HeartRate)
        }

        const after = this.capabilities.join(',')

        if (before !== after) {
            this.emit('device-info', this.getSettings(), {capabilities:this.capabilities})
        }
    }


}

