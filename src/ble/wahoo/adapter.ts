import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter, cRR, cwABike } from '../fm';
import BleWahooDevice from './comms';
import BleAdapter from '../adapter';
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from '../../base/adpater';
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties } from '../types';
import { IncyclistCapability } from '../../types/capabilities';


export default class BleWahooAdapter extends BleFmAdapter {
   
    constructor( settings:BleDeviceSettings, props?:BleDeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('BLE-WahooFM')
        const {id,address,name} = settings
        const logger = this.logger
        const ble = this.ble

        this.device = new BleWahooDevice( {id,address,name,ble,logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]

    }

    isSame(device:BleAdapter):boolean {
        if (!(device instanceof BleWahooAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

   
    getProfile() {
        return 'Smart Trainer';
    }


    async start( props: BleStartProperties={} ): Promise<any> {
        this.logger.logEvent({message: 'start requested', protocol:this.getProtocolName(),props})
            
        try {

            if ( this.ble.isScanning()) {
                this.logger.logEvent({message:'stop previous scan',isScanning:this.ble.isScanning()})
                await this.ble.stopScan();
            }

            const bleDevice = await this.ble.connectDevice(this.device) as BleWahooDevice
           

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
                const {user,bikeWeight=DEFAULT_BIKE_WEIGHT} = props || {}
                const weight = (user && user.weight ? Number(user.weight) : DEFAULT_USER_WEIGHT) +  bikeWeight;
                await bleDevice.setSimMode(weight, bleDevice.getCrr(), bleDevice.getCw())

                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendUpdate(startRequest);

                bleDevice.on('data', (data)=> {
                    this.onDeviceData(data)
                    
                })

                if (bleDevice.isHrm() && !this.hasCapability(IncyclistCapability.HeartRate)) {
                    this.capabilities.push(IncyclistCapability.HeartRate)
                }

                this.resetData();      
                this.stopped = false;    
                this.started = true;
                this.paused = false;

                return true;
            }    
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, profile:this.getProfile()})
            throw new Error(`could not start device, reason:${err.message}`)

        }
    }

}

