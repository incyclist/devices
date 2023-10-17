import {EventLogger} from 'gd-eventlog';
import { BleFmAdapter, cRR, cwABike } from '../fm';
import BleWahooDevice from './comms';
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../../base/consts";
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties } from '../types';
import { IncyclistCapability,IAdapter } from '../../types';
import { BleWahooComms } from '.';
import { LegacyProfile } from '../../antv2/types';


export default class BleWahooAdapter extends BleFmAdapter {
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'
   
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

    isSame(device:IAdapter):boolean {
        if (!(device instanceof BleWahooAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

   
    getProfile():LegacyProfile {
        return 'Smart Trainer';
    }


    async start( props: BleStartProperties={} ): Promise<any> {

        const wasPaused = this.paused
        const wasStopped = this.stopped

        if (wasPaused)
            this.resume()
        if (wasStopped)
            this.stopped = false

        if (this.started && !wasPaused && !wasStopped)
            return true;
                
        this.logger.logEvent({message: 'start requested', protocol:this.getProtocolName(),props})
            
        try {

            if ( this.ble.isScanning()) {
                this.logger.logEvent({message:'stop previous scan',isScanning:this.ble.isScanning()})
                await this.ble.stopScan();
            }

            const connected = await this.connect()
            if (!connected)
                throw new Error(`could not start device, reason:could not connect`)
                

            const comms = this.device as BleWahooComms
           

            if (comms) {
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
                const {user,bikeWeight=DEFAULT_BIKE_WEIGHT} = props || {}
                const weight = (user && user.weight ? Number(user.weight) : DEFAULT_USER_WEIGHT) +  bikeWeight;
                await comms.setSimMode(weight, comms.getCrr(), comms.getCw())

                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendUpdate(startRequest);

                comms.on('data', (data)=> {
                    this.onDeviceData(data)
                    
                })

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

