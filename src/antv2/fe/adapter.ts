import { FitnessEquipmentSensor, FitnessEquipmentSensorState, Profile } from "incyclist-ant-plus";

import  AntAdapter from "../base/adapter";
import ICyclingMode, {  UpdateRequest } from '../../modes/types';
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import { IncyclistAdapterData, IncyclistBikeData,IncyclistCapability,ControllerConfig } from "../../types";
import AntAdvSimCyclingMode from "../../modes/ant-fe-adv-st-mode";
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../../base/consts";
import ERGCyclingMode from "../../modes/antble-erg";
import SmartTrainerCyclingMode from "../../modes/antble-smarttrainer";
import PowerMeterCyclingMode from "../../modes/power-meter";

const DEFAULT_BIKE_WEIGHT_MOUNTAIN = 14.5;

interface AntFEStartDeviceProperties extends AntDeviceProperties {
    reconnect?:boolean
    restart?:boolean,
    reconnectTimeout?: number
}

export default class AntFEAdapter extends AntAdapter<FitnessEquipmentSensorState>{
    
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'
    protected static ANT_PROFILE_NAME:Profile = 'FE'
    protected static controllers: ControllerConfig = {
        modes: [SmartTrainerCyclingMode,ERGCyclingMode,AntAdvSimCyclingMode],
        default:SmartTrainerCyclingMode
    }

    protected distanceInternal?: number;
    protected startProps : AntDeviceProperties;
    protected promiseReconnect: Promise<boolean>
    protected promiseSendUpdate: Promise<boolean>
    protected promiseStop: Promise<boolean>

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {
        super(settings, props)

        this.startProps = {};

        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]
    }

    getDisplayName() {
        const {InstantaneousPower} = this.deviceData;
        const pwrStr = InstantaneousPower ? ` (${InstantaneousPower})` : '';
        return `${this.getUniqueName()}${pwrStr}`        
    }

    /* istanbul ignore next */
    isReconnecting():boolean {
        return this.promiseReconnect!==null && this.promiseReconnect!==undefined
    }

    getDefaultCyclingMode(): ICyclingMode {

        if (this.props.capabilities  && this.props.capabilities.indexOf(IncyclistCapability.Control)===-1)
            return new PowerMeterCyclingMode(this);

        return super.getDefaultCyclingMode();
    }


    
    async sendUpdate(request:UpdateRequest):Promise<UpdateRequest|void> {

        // don't send any commands if we are pausing or reconnecting
        if( (this.paused || this.isReconnecting()) && !request.forced)
            return;

        // currently stopping
        if (this.promiseStop)
            return

        // busy with previous update 
        if (this.promiseSendUpdate) {
            this.logEvent({message: 'send bike update skipped', device:this.getName(),request, reason:'busy'})
            return;
        }

        let isReset = request.reset && Object.keys(request).length===1 
        const update = isReset ? this.getCyclingMode().getBikeInitRequest() : this.getCyclingMode().sendBikeUpdate(request)

        this.logEvent({message: 'send bike update requested', device:this.getName(),update, request})

        try {
            const fe = this.sensor as FitnessEquipmentSensor;
            
            
            if (update.slope!==undefined) {
                this.promiseSendUpdate =  fe.sendTrackResistance(update.slope)
            }
    
            if (update.targetPower!==undefined) {
                this.promiseSendUpdate = fe.sendTargetPower(update.targetPower)
            }
            await this.promiseSendUpdate
            delete this.promiseSendUpdate

            return update
        
        }
        catch( err) {

            delete this.promiseSendUpdate
            if (err.message && err.message.toLowerCase()==='timeout') {
                
                this.emit('timeout')
                if ( this.startProps.automaticReconnect) {
                    await this.reconnect()
                }
            }

            this.logEvent( {message:'sendBikeUpdate() error',device:this.getName(),error:err.message})
        }


    }

    onDeviceData(deviceData: FitnessEquipmentSensorState): void {
        super.onDeviceData(deviceData)

        if (deviceData.HeartRate && !this.hasCapability(IncyclistCapability.HeartRate)) {
            this.capabilities.push(IncyclistCapability.HeartRate)
            this.emit('device-info', this.getSettings(), {capabilities:this.capabilities})
        }
    }

    mapData(deviceData:FitnessEquipmentSensorState) : IncyclistBikeData {
        // update data based on information received from ANT+FE sensor
        
        const data:IncyclistBikeData = {
            isPedalling: false,
            power: 0,
            pedalRpm: 0,
            speed: 0,
        }

        data.speed = (deviceData?.VirtualSpeed ?? (deviceData.RealSpeed||0))*3.6;
        data.slope = deviceData?.Incline ?? data.slope;
        data.power = deviceData?.InstantaneousPower ?? data.power;        
        data.pedalRpm = deviceData.Cadence ??data.pedalRpm ;
        data.isPedalling = data.pedalRpm>0 || data.power>0;

        if (deviceData.HeartRate!==undefined)
            data.heartrate = deviceData.HeartRate
        if (deviceData.Distance!==undefined)
            data.distanceInternal = deviceData.Distance
        if (deviceData.ElapsedTime!==undefined)
            data.time = deviceData.ElapsedTime

        return data;
    }

    transformData( adapterData:IncyclistBikeData,deviceData:FitnessEquipmentSensorState): void {


        const data:IncyclistAdapterData = Object.assign( this.data, {            
            power: adapterData.power,
            speed: adapterData.speed,
            cadence: adapterData.pedalRpm,
            timestamp: Date.now()
        })

        if (adapterData.distanceInternal!==undefined) {   
            if (data.internalDistanceCounter!==undefined)
                data.distance =  adapterData.distanceInternal-data.internalDistanceCounter
            data.internalDistanceCounter = adapterData.distanceInternal
        }

        if (deviceData.Distance)
            data.deviceDistanceCounter = deviceData.Distance

        if(adapterData.heartrate)
            data.heartrate = adapterData.heartrate
        if(adapterData.slope)
            data.slope = adapterData.slope
        if (adapterData.time)
            data.deviceTime = adapterData.time

        this.data = data
    }

    async start(props:AntFEStartDeviceProperties={}): Promise<boolean>{
        
        return await super.start(props)
    }


    resetStartStatus(): void {
        const props: AntFEStartDeviceProperties = this.startProps as AntFEStartDeviceProperties
        const isReconnect = props.reconnect||false;
        const isRestart  =props.restart|| false

        super.resetStartStatus()

        if (isReconnect) {
            delete props.reconnect
            this.startStatus.userInitialized = true;
            this.startStatus.controlInitialized = true
        }        
        if (isRestart) {
            delete props.restart
            this.startStatus.sensorStarted = true;
            this.startStatus.hasData = true;
        }
     }

    async startPreChecks(props:AntFEStartDeviceProperties):Promise< 'done' | 'connected' | 'connection-failed'   > {
        this.startProps = props;
        this.setFEDefaultTimeout() // set Timeout for a resonse of a Acknowledge message


        if (this.started && this.paused ) { 
            this.resume()
            props.restart =true;
            return 'connected';
        }
        return await super.startPreChecks(props)
    }


 
    async  initControl(): Promise<void> {
        await this.sendInititalUserMessage()
        await this.sendInitialRequest()
    }

    async sendInititalUserMessage():Promise<void> {
        const props = this.startProps;
        const {sensorStarted,hasData,userInitialized, timeout} = this.startStatus
        if (!sensorStarted || !hasData || userInitialized|| timeout)
            return;

        const opts = props || {} as any;
        const {args ={}, user={}} = opts;
        const fe = this.sensor as FitnessEquipmentSensor;

        try {

            const mode = this.getCyclingMode()
            const bikeType = mode ? mode.getSetting('bikeType').toLowerCase() : 'race';
            const defaultBikeWeight = bikeType==='mountain' ? DEFAULT_BIKE_WEIGHT_MOUNTAIN : DEFAULT_BIKE_WEIGHT; 
            const userWeight = args.userWeight || user.weight ||DEFAULT_USER_WEIGHT;
            const bikeWeight = args.bikeWeight||defaultBikeWeight;

            this.startStatus.userInitialized = await fe.sendUserConfiguration( userWeight, bikeWeight, args.wheelDiameter, args.gearRatio);
        }
        catch(err) {
            this.logEvent( { message:'sending FE message error',device:this.getName(), error:err.message })
            this.startStatus.userInitialized = false;
        }
    }

    async sendInitialRequest():Promise<void> {
        const {sensorStarted,hasData,controlInitialized, timeout} = this.startStatus
        if (!sensorStarted || !hasData || controlInitialized|| timeout)
            return;

        const fe = this.sensor as FitnessEquipmentSensor;
        try {
            const startRequest = this.getCyclingMode().getBikeInitRequest()
            if (startRequest){
                if (startRequest.targetPower!==undefined && startRequest.targetPower!==null) {
                    this.startStatus.controlInitialized = await fe.sendTargetPower(startRequest.targetPower) 
                }
                else if (startRequest.slope!==undefined && startRequest.slope!==null) {
                    this.startStatus.controlInitialized = await fe.sendTrackResistance(startRequest.slope)
                }                            
                else {
                    this.startStatus.controlInitialized = true;
                }
            }
            else {
                this.startStatus.controlInitialized = await fe.sendTrackResistance(0.0)                            
            }

        }
        catch(err) {
            this.logEvent( { message:'sending FE message error',device:this.getName(), error:err.message })
            this.startStatus.controlInitialized = false
        }

    } 

    setFEDefaultTimeout() {
        const fe = this.sensor as FitnessEquipmentSensor;
        
        fe.setSendTimeout(5000);
        
    }

    async stop(): Promise<boolean> {
        if (this.promiseStop)
            return await this.promiseStop

        this.promiseStop = super.stop()
        this.sensorConnected = false;
        const stopped = await this.promiseStop
        delete this.promiseStop
        return stopped
    }



    async reconnect(): Promise<boolean> {
        this.logEvent( {message:'reconnect to device',device:this.getName()})

        // already reconnecting ?
        if (this.promiseReconnect) {
            return await this.promiseReconnect
        }

        const doReconnect = async ():Promise<boolean> => {
            try {          
                await this.stop();
                await this.start({...this.startProps,reconnect:true})
                this.started = true;
                this.logEvent( {message:'reconnect success',device:this.getName()})
                return true;
            }
            catch(err) {
                this.logEvent( {message:'reconnect failed',device:this.getName()})
                return false;
            }
        }

        this.promiseReconnect = doReconnect()

        const res = await this.promiseReconnect
        this.promiseReconnect=null;
        return res;

    }

    async sendInitCommands():Promise<boolean> {
        if (this.started && !this.stopped) {
            try {
                if (this.getCyclingMode() instanceof ERGCyclingMode) {
                
                    const power = this.data.power
                    const request = power ? {targetPower:power} : this.getCyclingMode().getBikeInitRequest()
                    await this.sendUpdate({...request,forced:true})
                    return true
                }
            }
            catch (err) {
                return false
            }
        }
        
        return false
    
    }

}