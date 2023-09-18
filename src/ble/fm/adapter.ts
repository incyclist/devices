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
    connectPromise: Promise<boolean>

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

        const modes =[PowerMeterCyclingMode]

        const features = (this.getComms() as BleFmComms)?.features
        if (!features)
            return [PowerMeterCyclingMode, FtmsCyclingMode,BleERGCyclingMode] 

        if (features.setPower===undefined || features.setPower) 
            modes.push(BleERGCyclingMode)

        if (features.setSlope===undefined || features.setSlope) 
            modes.push(FtmsCyclingMode)

        return modes;
    }
   
 
    getDefaultCyclingMode(): CyclingMode {

        const features = (this.getComms() as BleFmComms)?.features
        if (!features)
            return new FtmsCyclingMode(this);

        if (features.setSlope===undefined || features.setSlope) 
            return new FtmsCyclingMode(this);

        if (features.setPower===undefined || features.setPower) 
            return new BleERGCyclingMode(this)

        return new PowerMeterCyclingMode(this);
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
        data.heartrate = deviceData.heartrate || data.heartrate
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
            heartrate: bikeData.heartrate,
            timestamp: Date.now()
        } as DeviceData;

        return data;
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

        
        this.logEvent({message: 'starting device', ...this.getSettings(),  protocol:this.getProtocolName(),props,isStarted:this.started, isConnected:this.getComms().isConnected() })

        const {restart=wasPaused} = props;

        if ( !restart && this.ble.isScanning() && !this.getComms().isConnected()) {
            //await this.ble.stopScan();
        }

        let scanOnly = props.scanOnly
        if (this.ble.isScanning() && this.getComms().isConnected()) {
            scanOnly = true;
        }
        else {

            const {timeout=20000} = props||{}            

            if (!this.connectPromise)
                this.connectPromise = this.connect()
                
            const res = await Promise.race( [ 
                this.connectPromise.then((connected)=> {
                    return {connected, reason:connected?null:'could not connect' }
                }) ,
                sleep(timeout).then(()=> ({connected: false, reason:'timeout'})) 
            ])
            this.connectPromise = undefined;
            const connected = res.connected
            if (!connected) {                
                throw new Error(`could not start device, reason:${res.reason}`)   
            }
            
            
        }
            
            
        try {
            
            const comms = this.device as BleFmComms
            if (comms) {                

                if (!scanOnly) {

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
                    await this.sendUpdate(startRequest,true);
                }

                if (!this.started && !wasPaused) {
                    comms.on('data', (data)=> {
                        this.onDeviceData(data)
                        
                    })
                    comms.on('disconnected', this.emit)
                }

                const before = this.capabilities.join(',')

                if (comms.features.heartrate && !this.hasCapability(IncyclistCapability.HeartRate)) {
                    this.capabilities.push(IncyclistCapability.HeartRate)
                }
                if (comms.features.cadence && !this.hasCapability(IncyclistCapability.Cadence)) {
                    this.capabilities.push(IncyclistCapability.Cadence)
                }
                if (comms.features.power && !this.hasCapability(IncyclistCapability.Power)) {
                    this.capabilities.push(IncyclistCapability.Power)
                }
                const after = this.capabilities.join(',')

                if (before !== after) {
                    this.emit('device-info', this.getSettings(), {capabilities:this.capabilities})
                }

                

                
                this.resetData();      
                this.stopped = false;    
                this.started = true;
                this.resume()
                
                return true;
            }    
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message, profile:this.getProfile()})
            throw new Error(`could not start device, reason:${err.message}`)

        }
    }

    async sendUpdate(request, enforced=false) {
        // don't send any commands if we are pausing, unless mode change was triggered
        if( !enforced && ( this.paused  || !this.device))
            return;
    
        
        try {

            const update = this.getCyclingMode().sendBikeUpdate(request)
            this.logEvent({message: 'send bike update requested',profile:this.getProfile(), update, request})

            const device = this.device as BleFitnessMachineDevice

            if (update.slope!==undefined) {
                await device.setSlope(update.slope)
            } 

            if (update.targetPower!==undefined) {
                await device.setTargetPower(update.targetPower)
            } 

        }
        catch(err) {
            this.logEvent({message:'error', fn:'sendUpdate()', request, error:err.message, stack:err.stack})
        }

        //this.logger.logEvent({message:'sendUpdate',request});    
        
    } 


    async sendInitCommands():Promise<boolean> {

        if (this.started && !this.stopped) {
            try {
                if (this.getCyclingMode() instanceof BleERGCyclingMode) {
                
                    const power = this.data.power
                    const request = power ? {targetPower:power} : this.getCyclingMode().getBikeInitRequest()
                    await this.sendUpdate(request,true)
                    return true
                }
            }
            catch {
                return false
            }
        }
        else {
            return false
        }
    }



}

