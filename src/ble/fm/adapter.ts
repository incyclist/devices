import {EventLogger} from 'gd-eventlog';
import PowerMeterCyclingMode from '../../modes/power-meter';
import FtmsCyclingMode from '../../modes/antble-smarttrainer';
import BleERGCyclingMode from '../../modes/antble-erg';
import BleFitnessMachineDevice from './sensor';
import BleAdapter  from '../base/adapter';
import ICyclingMode, { CyclingMode } from '../../modes/types';
import { IndoorBikeData } from './types';
import { cRR, cwABike } from './consts';
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties, IBlePeripheral } from '../types';
import { IAdapter,IncyclistCapability,IncyclistAdapterData,IncyclistBikeData } from '../../types';
import { LegacyProfile } from '../../antv2/types';
import { InteruptableTask } from '../../utils/task';

export default class BleFmAdapter extends BleAdapter<IndoorBikeData,BleFitnessMachineDevice> {
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'

    distanceInternal: number = 0;
    connectPromise: Promise<boolean>

    constructor( settings:BleDeviceSettings, props?:BleDeviceProperties) {
        super(settings,props);

        this.logger = new EventLogger('BLE-FM')

        this.device = new BleFitnessMachineDevice( this.getPeripheral(), {logger:this.logger})
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]

    }


    updateSensor(peripheral:IBlePeripheral) {
        this.device = new BleFitnessMachineDevice( peripheral, {logger:this.logger})
    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof BleFmAdapter))
            return false;
        return this.isEqual(device.settings as BleDeviceSettings)
    }


    isControllable(): boolean {
        return true;
    }

    getSupportedCyclingModes() : Array<typeof CyclingMode> {

        const modes:Array<typeof CyclingMode> =[PowerMeterCyclingMode]

        const features = this.getComms()?.features
        if (!features)
            return [PowerMeterCyclingMode, FtmsCyclingMode,BleERGCyclingMode] 

        if (features.setPower===undefined || features.setPower) 
            modes.push(BleERGCyclingMode)

        if (features.setSlope===undefined || features.setSlope) 
            modes.push(FtmsCyclingMode)

        return modes;
    }
   
 
    getDefaultCyclingMode(): ICyclingMode {

        const features = this.getComms()?.features
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

        data.power = deviceData?.instantaneousPower ?? data.power;
        data.pedalRpm = deviceData?.cadence ?? data.pedalRpm ;
        data.time = deviceData?.time ?? data.time;
        data.isPedalling = data.pedalRpm>0 || (data.pedalRpm===undefined && data.power>0);
        data.heartrate = deviceData.heartrate || data.heartrate
        return data;
    }

    transformData( bikeData:IncyclistBikeData): IncyclistAdapterData {
        
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
        } as IncyclistAdapterData;

        return data;
    }

    
    
    protected checkResume() {
        const wasPaused = this.paused
        const wasStopped = this.stopped

        if (wasPaused)
            this.resume()
        this.stopped = false

        if (this.started && !wasPaused && !wasStopped)
            return [wasPaused, true];

        return [wasPaused, false];
    }
        
    
    protected async initControl(_startProps?:BleStartProperties) {
        this.setConstants();

        await this.establishControl();
        this.setConstants();  
        await this.sendInitialRequest()
    }

    protected setConstants() {
        const mode = this.getCyclingMode();
        const sensor = this.getComms();

        if (mode?.getSetting('bikeType')) {
            const bikeType = mode.getSetting('bikeType').toLowerCase();
            sensor.setCrr(cRR);

            switch (bikeType) {
                case 'race': sensor.setCw(cwABike.race); break;
                case 'triathlon': sensor.setCw(cwABike.triathlon); break;
                case 'mountain': sensor.setCw(cwABike.mountain); break;
            }
        }
    }

    protected async establishControl() {
        if (!this.isStarting())
            return false

        let waitTask;
        let iv;
        const sensor = this.getComms();

        const wait = ():Promise<boolean> =>{
            const res = new Promise<boolean>( (resolve) => {
                iv = setInterval( async ()=> { 
                    if ( !this.isStarting() || !waitTask?.isRunning) {
                        resolve(false)
                        clearInterval(iv)
                        return;
                    }

                    const hasControl = await sensor.requestControl();

                    if (hasControl) {                        
                        clearInterval(iv)
                        resolve(true)
                    }
                    else if ( !this.isStarting() || !waitTask?.isRunning) {
                        resolve(false)
                        clearInterval(iv)
                    }
                }, 1000)    

            })
            return res;
        }

        waitTask = new InteruptableTask( wait(), {
            errorOnTimeout:false,
            timeout:10000
        })


        const hasControl = await waitTask.run();       
        clearInterval(iv)

        if (!hasControl && this.isStarting())  
            throw new Error('could not establish control');
    }

    protected async sendInitialRequest() {
        const startRequest = this.getCyclingMode().getBikeInitRequest()
        await this.sendUpdate(startRequest,true);

    }

    protected checkCapabilities() {
        const before = this.capabilities.join(',')
        const sensor = this.getComms()

        if (sensor.features?.heartrate && !this.hasCapability(IncyclistCapability.HeartRate)) {
            this.capabilities.push(IncyclistCapability.HeartRate)
        }
        if (sensor.features?.cadence && !this.hasCapability(IncyclistCapability.Cadence)) {
            this.capabilities.push(IncyclistCapability.Cadence)
        }
        if (sensor.features?.power && !this.hasCapability(IncyclistCapability.Power)) {
            this.capabilities.push(IncyclistCapability.Power)
        }
        const after = this.capabilities.join(',')

        if (before !== after) {
            this.logEvent({message:'device capabilities updated', name:this.getSettings().name, interface:this.getSettings().interface,capabilities: this.capabilities})    
            this.emit('device-info', this.getSettings(), {capabilities:this.capabilities})
        }
    }

    async sendUpdate(request, enforced=false) {
        // don't send any commands if we are pausing, unless mode change was triggered
        if( !enforced && ( this.paused  || !this.device))
            return;
    
        
        try {

            const update = this.getCyclingMode().sendBikeUpdate(request)
            this.logEvent({message: 'send bike update requested',profile:this.getProfile(), update, request})

            const device = this.device

            if (update.slope!==undefined) {
                await device.setSlope(update.slope)
            } 

            if (update.targetPower!==undefined) {
                await device.setTargetPower(update.targetPower)
            } 

        }
        catch(err) {
            if (err.message==='not connected') {
                this.logEvent({message:'send bike update failed', reason:'not connected'})
            }
            this.logEvent({message:'error', fn:'sendUpdate()', request, error:err.message, stack:err.stack})
        }
        
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

