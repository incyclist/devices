import {EventLogger} from 'gd-eventlog';
import PowerMeterCyclingMode from '../../modes/power-meter.js';
import FtmsCyclingMode from '../../modes/antble-smarttrainer.js';
import BleERGCyclingMode from '../../modes/antble-erg.js';
import BleFitnessMachineDevice from './sensor.js';
import BleAdapter  from '../base/adapter.js';
import ICyclingMode, { CyclingMode, UpdateRequest } from '../../modes/types.js';
import { IndoorBikeData, IndoorBikeFeatures } from './types.js';
import { cRR, cwABike } from './consts.js';
import { BleDeviceProperties, BleDeviceSettings, BleStartProperties, IBlePeripheral } from '../types.js';
import { IAdapter,IncyclistCapability,IncyclistAdapterData,IncyclistBikeData } from '../../types/index.js';
import { LegacyProfile } from '../../antv2/types.js';
import { sleep } from '../../utils/utils.js';
import { BleZwiftPlaySensor } from '../zwift/play/index.js';
import { useFeatureToggle } from '../../features/index.js';
import FMResistanceMode from '../../modes/fm-resistance.js';

export default class BleFmAdapter extends BleAdapter<IndoorBikeData,BleFitnessMachineDevice> {
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'

    protected distanceInternal: number = 0;
    protected connectPromise: Promise<boolean>|undefined
    protected requestControlRetryDelay = 1000
    protected promiseSendUpdate: Promise<UpdateRequest|void>|undefined
    protected zwiftPlay: BleZwiftPlaySensor|undefined
    protected isHubInitialized: boolean = false

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

    supportsVirtualShifting(): boolean {
        if (!this.getFeatureToggle().has('VirtualShifting')) 
            return false

        return this.device?.supportsVirtualShifting()??false
    }

    getSupportedCyclingModes() : Array<typeof CyclingMode> {

        const modes:Array<typeof CyclingMode> =[PowerMeterCyclingMode]
        if (this.props?.capabilities  && this.props.capabilities.indexOf(IncyclistCapability.Control)===-1)
            return modes

        const features = this.getSensor()?.features
        if (!features)
            return [PowerMeterCyclingMode, FtmsCyclingMode,BleERGCyclingMode] 

        if (features.setPower===undefined || features.setPower) 
            modes.push(BleERGCyclingMode)

        if (features.setSlope===undefined || features.setSlope) 
            modes.push(FtmsCyclingMode)

        if (features.setResistance) {
            modes.push( FMResistanceMode)
        }

        return modes;
    }
   

    getDefaultCyclingMode(): ICyclingMode {

        if (this.props?.capabilities  && this.props.capabilities.indexOf(IncyclistCapability.Control)===-1)            
            return this.createMode(PowerMeterCyclingMode);

        const features = this.getSensor()?.features        
        if (!features) {
            return this.createMode(FtmsCyclingMode)
        }

        if (features.setSlope===undefined || features.setSlope) {
            return this.createMode(FtmsCyclingMode)
        }

        if (features.setPower===undefined || features.setPower) 
            return this.createMode(BleERGCyclingMode)

        if (features.setResistance) {
            return this.createMode(FMResistanceMode);
        }


        return this.createMode(PowerMeterCyclingMode);
    }

    mapData(deviceData:IndoorBikeData): IncyclistBikeData{
        // update data based on information received from ANT+PWR sensor
        const data:IncyclistBikeData = {
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
        data.isPedalling = (data.pedalRpm??0)>0 || (data.pedalRpm===undefined && data.power>0);
        data.heartrate = deviceData.heartrate || data.heartrate

        const features = this.getSensor()?.features        
        if (features?.setResistance || features?.fmInfo?.includes('resistanceLevel')) { 
            data.resistance = deviceData.resistanceLevel
        }


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
            timestamp: Date.now(),
            gearStr: bikeData.gearStr
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
        
    protected async initVirtualShifting(initHub:boolean = false) {

        if (!this.zwiftPlay || initHub===true)
            this.logEvent({message:'init virtual shifting', hasSensor: this.zwiftPlay!==undefined})

        try {
            this.zwiftPlay = this.zwiftPlay ?? new BleZwiftPlaySensor( this.device, {logger:this.logger, isTrainer:true})

            if ( initHub && this.zwiftPlay && !this.isHubInitialized) {
                // todo: remove and only init once it is used
                // for now: I want to get more data on what the trainers are sending
                this.isHubInitialized = await this.zwiftPlay.initHubService(false)
            }

        }
        catch(err) {
            this.logEvent({message:'could not init virtual shifting', reason:(err as Error).message})    
            delete this.zwiftPlay    
            this.isHubInitialized =false    
        }
    }

    

    protected async initControl(_startProps?:BleStartProperties) {
        if (!this.isStarting())
            return;

        this.setConstants();

        // In some cases, the device does not support fitness machine features, which might have been detected in checkCapabilities()
        // therefore we need to check if we still have control capabilties
        if (!this.hasCapability(IncyclistCapability.Control)) 
            return;

        await this.establishControl();        
        await this.sendInitialRequest()        
    }

    protected setConstants() {
        const mode = this.getCyclingMode();
        const sensor = this.getSensor();

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

        let hasControl = false
        let tryCnt = 0;
        
        const sensor = this.getSensor();

        return new Promise<boolean>( (resolve) =>{


            this.startTask.notifyOnStop(() => {
                resolve(false)
            })

            const waitUntilControl = async ()=>{
                if (this.supportsVirtualShifting() ) {
                    await this.initVirtualShifting()
                }


                while (!hasControl && this.isStarting()) {
                    if (tryCnt++ === 0) {
                        this.logEvent( {message:'requesting control', device:this.getName(), interface:this.getInterface()})
                    }
                    hasControl = await sensor.requestControl();    
                    if (hasControl) {                        
                        this.logEvent( {message:'control granted', device:this.getName(), interface:this.getInterface()})
                        resolve( this.isStarting() )
                    }
                    else {
                        await sleep(this.requestControlRetryDelay)
                    }
                }
    
            }
            waitUntilControl()                
        })

    }

    protected async sendInitialRequest() {


        const startRequest = this.getCyclingMode().getBikeInitRequest()

        await this.sendUpdate(startRequest,true);

    }

    protected updateCyclingModeConfig() {

        const modes = this.getSupportedCyclingModes()
        modes.forEach( ModeClass=> {
            const mode = this.createMode(ModeClass)
            mode.resetConfig()
            mode.getConfig()

        })
    }

    protected async checkCapabilities() {
        const before = this.capabilities.join(',')
        const sensor = this.getSensor()

        if (!sensor.features) {
            try {
                await sensor.getFitnessMachineFeatures()
            }
            catch(err) {
                this.logEvent( {message:'error getting fitness machine features', device:this.getName(), interface:this.getInterface(), error:err})    
            }
        }

        if (sensor.features) {
            this.updateCapabilitiesFromFeatures(sensor.features);           
        }


        const after = this.capabilities.join(',')

        if (before !== after) {
            this.logEvent({message:'device capabilities updated', name:this.getSettings().name, interface:this.getSettings().interface,capabilities: this.capabilities})    
            this.emit('device-info', this.getSettings(), {capabilities:this.capabilities})

            this.updateCyclingModeConfig()
        }
    }

    protected updateCapabilitiesFromFeatures(features: IndoorBikeFeatures) {
        
        if (features.heartrate && !this.hasCapability(IncyclistCapability.HeartRate)) {
            this.capabilities.push(IncyclistCapability.HeartRate);
        }

        if (features.cadence && !this.hasCapability(IncyclistCapability.Cadence)) {
            this.capabilities.push(IncyclistCapability.Cadence);
        }
        if (features.cadence===false && this.hasCapability(IncyclistCapability.Cadence)) {
            this.capabilities = this.capabilities.filter(cap => cap !== IncyclistCapability.Cadence);
        }

        if (features.power && !this.hasCapability(IncyclistCapability.Power)) {
            this.capabilities.push(IncyclistCapability.Power);
        }
        if (features.power===false && this.hasCapability(IncyclistCapability.Power)) {
            this.capabilities = this.capabilities.filter(cap => cap !== IncyclistCapability.Power);
            
        }
        if (features.setPower === false && features.setSlope === false && features.setResistance === false ) {
            this.logEvent({message:'downgrade to Power Meter', name:this.getSettings().name, interface:this.getSettings().interface})
            this.capabilities = this.capabilities.filter(cap => cap !== IncyclistCapability.Control);
        }
    }
 
    async sendUpdate(request, enforced=false):Promise<UpdateRequest|void> {

        if (this.promiseSendUpdate!==undefined  ) {
            await this.promiseSendUpdate
            this.promiseSendUpdate = undefined
        }

        // don't send any commands if we are pausing, unless mode change was triggered
        if( !enforced && ( this.paused  || !this.device))
            return;
                
    
        // don't send any commands if the device is stopped and not starting
        if( !enforced && ( this.stopped && !this.isStarting()))
            return
        
        try {

            const update = this.getCyclingMode().buildUpdate(request)
            this.logEvent({message: 'send bike update requested',profile:this.getProfile(),mode:this.getCyclingMode()?.getName(),  update, request})

            const device = this.getSensor()

            // don't send any commands if the Control capability is not supported
            if (this.hasCapability(IncyclistCapability.Control)) {

                const send = async ()=> {             
                    const res: UpdateRequest = {}
                    if (update.slope!==undefined) {
                        if (update.isHub) {
                            await this.initVirtualShifting(true)                            
                            if (this.zwiftPlay) {
                                await this.zwiftPlay.setIncline(update.slope)
                            }
                        }
                        else {
                            await device.setSlope(update.slope)
                        }
                        res.slope = update.slope
                    } 

                    if (update.targetPower!==undefined && !update.isHub) {
                        const tp = update.targetPower>0 ? update.targetPower : 0
                        await device.setTargetPower(tp)
                        res.targetPower = tp
                    } 

                    if (update.targetResistance!==undefined && !update.isHub) {
                        await device.setTargetResistanceLevel(update.targetResistance)
                        res.targetResistance = update.targetResistance
                        
                    }

                    if (update.gearRatio!==undefined ) {

                        await this.initVirtualShifting(true)                            

                        if (this.zwiftPlay && !Number.isNaN(update.gearRatio)) {
                            const gearRatio = await this.zwiftPlay.setGearRatio( update.gearRatio)
                            res.gearRatio = gearRatio
                        }
                    } 



                    return res  
                }

                this.promiseSendUpdate = send()
                const confirmed = await this.promiseSendUpdate
                if (confirmed) {
                    this.getCyclingMode().confirmed(confirmed)                
                }
                delete this.promiseSendUpdate
                return confirmed

            }

        }
        catch(error) {
            const err = error as Error
            delete this.promiseSendUpdate
            if (err.message==='not connected') {
                this.logEvent({message:'send bike update failed', reason:'not connected'})
            }
            this.logEvent({message:'error', fn:'sendUpdate()', request, error:err.message, stack:err.stack})
        }
        
    } 


    async sendInitCommands():Promise<boolean> {

        if (this.started && !this.stopped) {
            try {
                const mode = this.getCyclingMode() as CyclingMode
                if (mode.isERG()) {
                
                    const power = this.data.power
                    const request = power ? {targetPower:power} : this.getCyclingMode().getBikeInitRequest()
                    await this.sendUpdate(request,true)
                    return true
                }
                else if ( (mode.isSIM() && this.supportsVirtualShifting()) || mode.isResistance()){
                    await this.sendInitialRequest()
                    return true
                }
            }
            catch {
                return false
            }
        }
        return false
    }

    protected getFeatureToggle() {
        return useFeatureToggle()
    }




}
