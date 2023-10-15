import { FitnessEquipmentSensor, FitnessEquipmentSensorState, ISensor, Profile } from "incyclist-ant-plus";

import  AntAdapter from "../base/adapter";
import {  UpdateRequest } from '../../modes/types';
import { IncyclistAdapterData, IncyclistBikeData } from "../../types/data";
import AntAdvSimCyclingMode from "../../modes/ant-fe-adv-st-mode";
import { runWithTimeout, sleep  } from "../../utils/utils";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import { IncyclistCapability } from "../../types/capabilities";
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../../base/consts";
import ERGCyclingMode from "../../modes/antble-erg";
import SmartTrainerCyclingMode from "../../modes/antble-smarttrainer";
import { ControllerConfig } from "../../types/adapter";

const DEFAULT_BIKE_WEIGHT_MOUNTAIN = 14.5;
const MAX_RETRIES = 3;

interface AntFEStartDeviceProperties extends AntDeviceProperties {
    reconnect?:boolean
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
    protected sensorConnected: boolean

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {
        super(settings, props)

        this.startProps = {};
        this.sensorConnected = false;      

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
    getDefaultReconnectDelay(): number {
        return 2000;    
    }

    /* istanbul ignore next */
    isReconnecting():boolean {
        return this.promiseReconnect!==null && this.promiseReconnect!==undefined
    }

    async sendUpdate(request:UpdateRequest, forced=false):Promise<void> {

        // don't send any commands if we are pausing or reconnecting
        if( (this.paused || this.isReconnecting()) && !forced)
            return;

        let isReset = request.reset && Object.keys(request).length===1 
        const update = isReset ? this.getCyclingMode().getBikeInitRequest() : this.getCyclingMode().sendBikeUpdate(request)

        this.logEvent({message: 'send bike update requested', update, request})

        try {
            const fe = this.sensor as FitnessEquipmentSensor;
            
            if (update.slope!==undefined) {
                await fe.sendTrackResistance(update.slope)
            }
    
            if (update.targetPower!==undefined) {
                await fe.sendTargetPower(update.targetPower)
            }
        
        }
        catch( err) {

            if (err.message && err.message.toLowerCase()==='timeout') {
                
                this.emit('timeout')
                if ( this.startProps.automaticReconnect) {
                    await this.reconnect()
                }
            }

            this.logEvent( {message:'sendBikeUpdate() error',error:err.message})
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

        data.speed = (deviceData.VirtualSpeed!==undefined ? deviceData.VirtualSpeed : (deviceData.RealSpeed||0))*3.6;
        data.slope = (deviceData.Incline!==undefined? deviceData.Incline :data.slope);
        data.power = (deviceData.InstantaneousPower!==undefined? deviceData.InstantaneousPower :data.power);        
        data.pedalRpm = (deviceData.Cadence!==undefined? deviceData.Cadence :data.pedalRpm) ;
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

    async start( props?: AntFEStartDeviceProperties ): Promise<any> {

        const isReconnect = props?.reconnect||false;
        const startProps = Object.assign({}, props||{})
        delete startProps.reconnect
        return await this.performStart(props,isReconnect)
    }


    async performStart( props: AntFEStartDeviceProperties, isReconnect:boolean ): Promise<any> {
        const wasPaused = this.paused 
        const wasStopped = this.stopped;

        this.startProps = props;

        if (wasPaused)
            this.resume()
        
        this.stopped = false;

        if (this.started && !wasPaused && !wasStopped) {
            return true;
        }
       
        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)


        this.logEvent( {message:'starting device', props, isStarted: this.started, isReconnecting: isReconnect})

        const {startupTimeout=this.getDefaultStartupTimeout(), reconnectTimeout=this.getDefaultReconnectDelay()} = props||{}
        const totalTimeout = Math.min( startupTimeout+10000, startupTimeout*2);
        let status = { timeout:false, sensorStarted:false, hasData:false, userSent: false, slopeSent:false}

        const doStart =  async ()=>{

            this.setFEDefaultTimeout() // set Timeout for a resonse of a Acknowledge message

            let success = false;
            let retry =0;

            if (isReconnect) {
                status.userSent = true;
                status.slopeSent = true;
            }

            while (!success && retry<MAX_RETRIES && !status.timeout) {
                if (retry!==0) {
                    console.log('~~~ RETRY', status)
                }
                retry++;

                await this.initSensor(status,props);
                await this.waitForInitialData(status,startupTimeout)
                await this.sendInititalUserMessage(status, props)
                await this.sendInitialRequest(status,props)
                
                if (!status.hasData) {                    
                    await this.stopSensor()
                    await sleep(reconnectTimeout)
                    continue
                }
                success = status.sensorStarted && status.hasData && status.userSent && status.slopeSent                    
                
            }

            if (success) {
                this.logEvent( {message:'ANT FE start success'})
                this.started = true;
                this.paused = false;
                return true;
            }
            else {
                this.started = false;
                if (!status.sensorStarted) { 
                    this.logEvent( {message:'ANT FE start failed',reason:'could not connect'})            
                    throw new Error('could not start device, reason:could not connect')
                }

                else if (!status.hasData) {          
                    this.logEvent( {message:'ANT FE start failed',reason:'no data received'})                
                    throw new Error('could not start device, reason:no data received')
                }
                else  {                    
                    this.logEvent( {message:'ANT FE start failed',reason:'could not send FE commands'})                
                    throw new Error('could not start device, reason:could not send FE commands')
                }

            }
    
        }

        try {
            await runWithTimeout(doStart(),totalTimeout)
        }
        catch(err) {
            if (err.message === 'Timeout') {
                this.started = false
                status.timeout = true;
                throw new Error(`could not start device, reason:timeout`)   
            }
            throw err
        }

        return true;

    }

    private async waitForInitialData(status,startupTimeout):Promise<void> {
        if ((status.sensorStarted && status.hasData) || !status.sensorStarted || status.timeout) 
            return;
       
        this.logEvent({ message: 'wait for sensor data', });
        status.hasData = await this.waitForData(startupTimeout)               
        if (status.hasData)
            this.logEvent({ message: 'sensor data received', });
    }

    async stopSensor() {
        if (!this.sensorConnected)
            return;

        try {
            await await this.ant.stopSensor(this.sensor);
            this.sensorConnected = false;
        }
        catch { }
    }

    async initSensor(status, props: any):Promise<boolean> {
        status.sensorStarted = this.sensorConnected
        if (status.sensorStarted || status.timeout) 
            return;

        this.logEvent({ message: 'start sensor', props });

        try {
            this.sensorConnected = await this.startSensor();

            if (this.sensorConnected) {
                this.logEvent({ message: 'sensor started', props });
                status.sensorStarted = true;
            }
    
        }
        catch (err) {
            this.logEvent({ message: 'start sensor failed', reason:err.message, props });
        }       
    }

    async sendInititalUserMessage(status,props):Promise<void> {
        if (!status.sensorStarted || !status.hasData || status.userSent || status.timeout)
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

            status.userSent = status.userSent || await fe.sendUserConfiguration( userWeight, bikeWeight, args.wheelDiameter, args.gearRatio);
        }
        catch(err) {
            this.logEvent( { message:'sending FE message error', error:err.message })
            status.userSent = false;
        }
    }

    async sendInitialRequest(status,props):Promise<void> {
        if (!status.sensorStarted || !status.hasData || status.slopeSent || status.timeout)
            return;

        const fe = this.sensor as FitnessEquipmentSensor;
        try {
            const startRequest = this.getCyclingMode().getBikeInitRequest()
            if (startRequest){
                if (startRequest.targetPower!==undefined && startRequest.targetPower!==null) {
                    status.slopeSent = await fe.sendTargetPower(startRequest.targetPower) 
                }
                else if (startRequest.slope!==undefined && startRequest.slope!==null) {
                    status.slopeSent = await fe.sendTrackResistance(startRequest.slope)
                }                            
                else {
                    status.slopeSent = true;
                }
            }
            else {
                status.slopeSent = await fe.sendTrackResistance(0.0)                            
            }

        }
        catch(err) {
            this.logEvent( { message:'sending FE message error', error:err.message })
            status.slopeSent = false
        }

    } 

    setFEDefaultTimeout() {
        const fe = this.sensor as FitnessEquipmentSensor;
        
        fe.setSendTimeout(5000);
        
    }

    stop(): Promise<boolean> {
        const stopped = super.stop()
        this.sensorConnected = false;
        return stopped
    }



    async reconnect(): Promise<boolean> {
        this.logEvent( {message:'reconnect to device'})

        // already reconnecting ?
        if (this.promiseReconnect) {
            return await this.promiseReconnect
        }

        const doReconnect = async ():Promise<boolean> => {
            try {          
                await this.stop();
                await this.performStart(this.startProps,true)
                this.started = true;
                this.logEvent( {message:'reconnect success'})
                return true;
            }
            catch(err) {
                this.logEvent( {message:'reconnect failed'})
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
                    await this.sendUpdate(request,true)
                    return true
                }
            }
            catch (err) {
                console.log(err)
                return false
            }
        }
        
        return false
    
    }


}