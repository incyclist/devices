import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter, cRR, cwABike } from '../fm';
import TacxAdvancedFitnessMachineDevice from './comms';
import BleAdapter from '../adapter';
import { DeviceProperties } from '../../types/device';
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from '../../base/adpater';
import { BleDeviceSettings, BleStartProperties } from '../types';
import { IncyclistCapability } from '../../types/capabilities';



export default class BleTacxFEAdapter extends BleFmAdapter {

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {

        super(settings,props);

        this.logger = new EventLogger('BLE-FEC-Tacx')
        const {id,address,name} = settings
        const logger = this.logger
        const ble = this.ble

        this.device = new TacxAdvancedFitnessMachineDevice( {id,address,name,ble,logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]
    
        
    }

    isSame(device:BleAdapter):boolean {
        if (!(device instanceof BleTacxFEAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

   
    getProfile() {
        return 'Smart Trainer'
    }


    async start( props:BleStartProperties={}): Promise<any> {
        this.logger.logEvent({message: 'start requested', protocol:this.getProtocolName(),props})


        if ( this.ble.isScanning())
            await this.ble.stopScan();
            
        try {
            const bleDevice = await this.ble.connectDevice(this.device) as TacxAdvancedFitnessMachineDevice
            bleDevice.setLogger(this.logger);

            if (bleDevice) {
                this.device = bleDevice;

                const mode = this.getCyclingMode()
                
                if (mode && mode.getSetting('bikeType')) {
                    const bikeType = mode.getSetting('bikeType').toLowerCase();
                    bleDevice.setCrr(cRR);
                    
                    switch (bikeType)  {
                        case 'race': bleDevice.setCw(cwABike.race); break;
                        case 'triathlon': bleDevice.setCw(cwABike.triathlon); break;
                        case 'mountain': bleDevice.setCw(cwABike.mountain); break;
                    }        
                }
                
                const {user, wheelDiameter, gearRatio,bikeWeight=DEFAULT_BIKE_WEIGHT} = props || {}
                const userWeight = (user && user.weight ? user.weight : DEFAULT_USER_WEIGHT);
                

                bleDevice.sendTrackResistance(0.0);
                bleDevice.sendUserConfiguration( userWeight, bikeWeight, wheelDiameter, gearRatio);

                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendUpdate(startRequest);

                bleDevice.on('data', (data)=> {
                    this.onDeviceData(data)                    
                })

                this.resetData();      
                this.stopped = false;    
                this.started = true;
                this.paused = false;

                if (bleDevice.isHrm() && !this.hasCapability(IncyclistCapability.HeartRate)) {
                    this.capabilities.push(IncyclistCapability.HeartRate)
                }

                return true;
            }    
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, profile:this.getProfile()})
            throw new Error(`could not start device, reason:${err.message}`)

        }
    }

}

