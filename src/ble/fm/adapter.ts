import BleInterface from '../ble-interface';
import {EventLogger} from 'gd-eventlog';
import PowerMeterCyclingMode from '../../modes/power-meter';
import FtmsCyclingMode from '../../modes/ble-st-mode';
import BleERGCyclingMode from '../../modes/ble-erg-mode';
import BleFitnessMachineDevice from './comms';
import BleAdapter, { BleControllableAdapter } from '../base/adapter';
import CyclingMode, { IncyclistBikeData } from '../../modes/cycling-mode';
import {  DeviceProperties } from '../../types/device';
import { IndoorBikeData } from './types';
import { cRR, cwABike } from './consts';
import { sleep } from '../../utils/utils';
import { DeviceData } from '../../types/data';
import { BleDeviceSettings, BleStartProperties } from '../types';
import { IncyclistCapability } from '../../types/capabilities';
import { BleFmComms } from '.';



export default class BleFmAdapter extends BleControllableAdapter {
   
    distanceInternal: number = 0;

    constructor( settings:BleDeviceSettings, props?:DeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('BLE-FM')
        const {id,address,name} = settings
        const logger = this.logger
        const ble = this.ble

        this.device = new BleFitnessMachineDevice( {id,address,name,ble,logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]

    }

    isSame(device:BleAdapter):boolean {
        if (!(device instanceof BleFmAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }

   
    getProfile() {
        return'Smart Trainer'
    }

    getName() {
        return `${this.device.name}`        
    }

    getDisplayName() {
        return this.getName();
    }

    getSupportedCyclingModes() : Array<any> {
        return [FtmsCyclingMode,BleERGCyclingMode, PowerMeterCyclingMode]
    }
   
 
    getDefaultCyclingMode(): CyclingMode {
        return new FtmsCyclingMode(this);
    }

    onDeviceData(deviceData:IndoorBikeData):void {
        
        super.onDeviceData(deviceData)

        if (!this.started || this.paused || !this.hasDataListeners())
            return;       
        

        this.logger.logEvent( {message:'onDeviceData',data:deviceData})        
        if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {
            // transform data into internal structure of Cycling Modes
            let incyclistData = this.mapData(deviceData)              
            
            // let cycling mode process the data
            incyclistData = this.getCyclingMode().updateData(incyclistData);                    

            // transform data into structure expected by the application
            this.data =  this.transformData(incyclistData);                  

            this.emitData(this.data)            
        }

    }

    mapData(deviceData:IndoorBikeData): IncyclistBikeData{
        // update data based on information received from ANT+PWR sensor
        const data = {
            isPedalling: false,
            power: 0,
            pedalRpm: undefined,
            speed: 0,
            heartrate:0,
            distanceInternal:0,        // Total Distance in meters             
            slope:undefined,
            time:undefined
        }

        data.power = (deviceData.instantaneousPower!==undefined? deviceData.instantaneousPower :data.power);
        data.pedalRpm = (deviceData.cadence!==undefined? deviceData.cadence :data.pedalRpm) ;
        data.time = (deviceData.time!==undefined? deviceData.time :data.time);
        data.isPedalling = data.pedalRpm>0 || (data.pedalRpm===undefined && data.power>0);
        return data;
    }

    transformData( bikeData:IncyclistBikeData): DeviceData {
        
        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance = Math.round(bikeData.distanceInternal-this.distanceInternal)
        }

        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        
        let data =  {
            speed: bikeData.speed,
            slope: bikeData.slope,
            power: bikeData.power!==undefined ? Math.round(bikeData.power) : undefined,
            cadence: bikeData.pedalRpm!==undefined ? Math.round(bikeData.pedalRpm) : undefined,
            distance,
            timestamp: Date.now()
        } as DeviceData;

        return data;
    }


    async start( props: BleStartProperties={} ): Promise<any> {
        if (this.started)
            return true;



        
        this.logger.logEvent({message: 'start requested', protocol:this.getProtocolName(),props})

        const {restart} = props;

        if ( !restart && this.ble.isScanning())
            await this.ble.stopScan();
            
        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)
            
        try {
            const comms = this.device as BleFmComms
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

                let hasControl = await comms.requestControl();
                if ( !hasControl) {
                    let retry = 1;
                    while(!hasControl && retry<3) {
                        await sleep(1000);
                        hasControl = await comms.requestControl();
                        retry++;
                    }
                }
                if (!hasControl)
                    throw new Error( 'could not establish control')

               
                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendUpdate(startRequest);

                comms.on('data', (data)=> {
                    this.onDeviceData(data)
                    
                })
                comms.on('disconnected', this.emit)

                if (comms.isHrm() && !this.hasCapability(IncyclistCapability.HeartRate)) {
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

    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused ||!this.device)
            return;

        const update = this.getCyclingMode().sendBikeUpdate(request)
        this.logger.logEvent({message: 'send bike update requested',profile:this.getProfile(), update, request})

        const device = this.device as BleFitnessMachineDevice
        if (update.slope!==undefined) {
            await device.setSlope(update.slope)
        } 

        if (update.targetPower!==undefined) {
            await device.setTargetPower(update.targetPower)
        } 

        //this.logger.logEvent({message:'sendUpdate',request});    
        
    } 

}

