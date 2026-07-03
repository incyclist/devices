import {EventLogger} from 'gd-eventlog';
import BleAdapter from '../base/adapter.js';
import {  BleDeviceSettings, IBlePeripheral } from '../types.js';
import { DeviceProperties,IncyclistCapability, IAdapter, IncyclistAdapterData, ControllerConfig, IncyclistBikeData  } from '../../types/index.js';
import { LegacyProfile } from '../../antv2/types.js';
import {BleCyclingSpeedCadenceDevice} from './sensor.js';
import { CSCData } from './types.js';
import ICyclingMode from '../../modes/types.js';
import SpeedCyclingMode from '../../modes/speed.js';


export class BleCSCAdapter extends BleAdapter<CSCData,BleCyclingSpeedCadenceDevice>{  
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Speed + Cadence Sensor'
    protected static CAPABILITIES:IncyclistCapability[] = [ IncyclistCapability.Speed, IncyclistCapability.Cadence]
    protected static controllers: ControllerConfig = {
        modes: [SpeedCyclingMode],
        default: SpeedCyclingMode
    }
    

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('Ble-CSC')

        this.device = new BleCyclingSpeedCadenceDevice( this.getPeripheral() , {logger: this.logger})
        this.capabilities = BleCSCAdapter.CAPABILITIES       
    }

    protected async checkCapabilities():Promise<void> {
        const before = this.capabilities.join(',')

        const sensor = this.getSensor()
        if (!sensor)
            return

        const features = await sensor.getFeatures()
        if (!features?.wheelRevolutionData)
            this.capabilities = this.capabilities.filter(c => c !== IncyclistCapability.Speed)
        if (!features?.crankRevolutionData)
            this.capabilities = this.capabilities.filter(c => c !== IncyclistCapability.Cadence)

        const after = this.capabilities.join(',')

        if (before !== after) {
            this.logEvent({message:'device capabilities updated', name:this.getSettings().name, interface:this.getSettings().interface,capabilities: this.capabilities})    
            this.emit('device-info', this.getSettings(), {capabilities:this.capabilities})
        }


    }


    isSame(device:IAdapter):boolean {
        if (!(device instanceof BleCSCAdapter))
            return false;        
        return this.isEqual(device.settings as BleDeviceSettings)
    }

    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleCyclingSpeedCadenceDevice( peripheral, {logger:this.logger})
    }

   
    getProfile():LegacyProfile {
        return BleCSCAdapter.INCYCLIST_PROFILE_NAME
    }

    getDisplayName() {
        return this.getName()        
    }

    mapData(deviceData:CSCData): IncyclistAdapterData{
        const {cadence, speed=0}  = deviceData
        return {cadence,speed} // speed is already in km/h from sensor
    }

    transformData( bikeData:IncyclistBikeData): IncyclistAdapterData {
      
        if ( bikeData===undefined)
            return {};
   
        
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



    setCyclingMode(mode: string | ICyclingMode, settings?: any, sendInitCommands?: boolean): void { 
        super.setCyclingMode(mode,settings,sendInitCommands)        

        // set wheel circumference (in m)
        try { 
            const wc = this.getCyclingMode().getSetting('wc')  // setting is in mm
            this.getSensor().setWheelCircumference( wc / 1000)
        }
        catch { /*ignore */}
    }

}

