import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter, cRR, cwABike } from '../fm';
import TacxAdvancedFitnessMachineDevice from './comms';
import BleAdapter from '../base/adapter';
import { DeviceProperties } from '../../types/device';
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from '../../base/adpater';
import { BleDeviceSettings, BleStartProperties } from '../types';
import { IncyclistCapability } from '../../types/capabilities';
import { BleTacxComms } from '.';



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

        const wasPaused = this.paused
        const wasStopped = this.stopped

        if (wasPaused)
            this.resume()
        if (wasStopped)
            this.stopped = false

        if (this.started && !wasPaused && !wasStopped)
            return true;

            
        if ( this.ble.isScanning()) {
            this.logger.logEvent({message:'stop previous scan',isScanning:this.ble.isScanning()})
            await this.ble.stopScan();
        }

        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)                  
                
        this.logger.logEvent({message: 'start requested', protocol:this.getProtocolName(),props})
        try {
            const comms = this.device as BleTacxComms;
            
            if (comms) {
                this.device = comms;

                const mode = this.getCyclingMode()
                
                if (mode && mode.getSetting('bikeType')) {
                    const bikeType = mode.getSetting('bikeType').toLowerCase();
                    comms.setCrr(cRR);
                    
                    switch (bikeType)  {
                        case 'race': comms.setCw(cwABike.race); break;
                        case 'triathlon': comms.setCw(cwABike.triathlon); break;
                        case 'mountain': comms.setCw(cwABike.mountain); break;
                    }        
                }
                
                const {user, wheelDiameter, gearRatio,bikeWeight=DEFAULT_BIKE_WEIGHT} = props || {}
                const userWeight = (user && user.weight ? user.weight : DEFAULT_USER_WEIGHT);
                

                comms.sendTrackResistance(0.0);
                comms.sendUserConfiguration( userWeight, bikeWeight, wheelDiameter, gearRatio);

                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendUpdate(startRequest);

                comms.on('data', (data)=> {
                    this.onDeviceData(data)                    
                })

                this.resetData();      
                this.stopped = false;    
                this.started = true;
                this.paused = false;

                if (comms.features && comms.features.heartrate && !this.hasCapability(IncyclistCapability.HeartRate)) {
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

