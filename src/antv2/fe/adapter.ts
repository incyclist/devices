import { FitnessEquipmentSensor, FitnessEquipmentSensorState, ISensor, Profile } from "incyclist-ant-plus";

import  { ControllableAntAdapter } from "../adapter";
import {getBrand} from '../utils'
import { EventLogger } from "gd-eventlog";
import CyclingMode, { IncyclistBikeData,UpdateRequest } from '../../modes/cycling-mode';
import AntStCyclingMode from "../modes/ant-fe-st-mode";
import AntFeERGCyclingMode from "../modes/ant-fe-erg-mode";
import AntAdvSimCyclingMode from "../modes/ant-fe-adv-st-mode";
import { sleep } from "../../utils/utils";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile } from "../types";
import SensorFactory from "../sensor-factory";
import { IncyclistCapability } from "../../types/capabilities";
import { DEFAULT_BIKE_WEIGHT, DEFAULT_USER_WEIGHT } from "../../base/adpater";

const DEFAULT_BIKE_WEIGHT_MOUNTAIN = 14.5;
const MAX_RETRIES = 3;

type FitnessEquipmentSensorData = {
    speed: number;
    slope: number;
    power: number;
    cadence: number;
    heartrate: number;
    distance: number;
    timestamp: number;
}

export default class AntFEAdapter extends ControllableAntAdapter<FitnessEquipmentSensorState, FitnessEquipmentSensorData>{
    static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Smart Trainer'
    static ANT_PROFILE_NAME:Profile = 'FE'

    protected distanceInternal?: number;
    protected startProps : AntDeviceProperties;
    protected isReconnecting: boolean
    protected sensorConnected: boolean

    constructor ( settings:AntDeviceSettings, props?:AntDeviceProperties) {
        // check against legacy settings (using protocol and Incyclist profile name)
        if (settings.protocol && settings.profile!==AntFEAdapter.INCYCLIST_PROFILE_NAME)
            throw new Error('Incorrect Profile')
        // check against new settings (not using protocol and and using ANT profile name)
        if (!settings.protocol && settings.profile!==AntFEAdapter.ANT_PROFILE_NAME)
            throw new Error('Incorrect Profile')

        super(settings, props)

        this.deviceData = {
            DeviceID: this.sensor.getDeviceID()
        } as FitnessEquipmentSensorState;
        this.dataMsgCount = 0;
        this.logger = new EventLogger('Ant+FE')
        this.isReconnecting = false
        this.startProps = {};
        this.sensorConnected = false;      

        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control
        ]
    }

    createSensor(settings:AntDeviceSettings):ISensor {
        const sensor = SensorFactory.create(AntFEAdapter.ANT_PROFILE_NAME, Number(settings.deviceID)) 
        return sensor
    }

    getName() {
        if (this.settings.name)
            return this.settings.name

        const deviceID = this.sensor.getDeviceID();
        return `Ant+FE ${deviceID}`        

    }

    getUniqueName(): string {
        if (this.settings.name)
            return this.settings.name

        const {DeviceID,ManId} = this.deviceData;
        const brand = getBrand(ManId)
        if (brand)
            return `${brand} FE ${DeviceID}`
        else 
            return `${this.getName()}`        
    }


    getDisplayName() {
        const {InstantaneousPower} = this.deviceData;
        const pwrStr = InstantaneousPower ? ` (${InstantaneousPower})` : '';
        return `${this.getUniqueName()}${pwrStr}`        
    }

    getSupportedCyclingModes() : Array<any> {
        return [AntStCyclingMode,AntFeERGCyclingMode,AntAdvSimCyclingMode]
    }

    getDefaultCyclingMode(): CyclingMode {
        return new AntStCyclingMode(this);
    }

    getLogData(data, excludeList) {
        
        const logData  = JSON.parse(JSON.stringify(data));
        excludeList.forEach( (key) => {
            delete logData[key] })
        return logData;
    }


    async sendUpdate(request:UpdateRequest, forced=false):Promise<void> {

        // don't send any commands if we are pausing
        if( (this.paused || this.isReconnecting) && !forced)
            return;

        let isReset = request.reset && Object.keys(request).length===1 
        const update = isReset ? this.getCyclingMode().getBikeInitRequest() : this.getCyclingMode().sendBikeUpdate(request)
        if (!update)
            return;

        this.logger.logEvent({message: 'send bike update requested', update, request})

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

            this.logger.logEvent( {message:'sendBikeUpdate() error',error:err.message})
        }


    }
    

    onDeviceData( deviceData:FitnessEquipmentSensorState) {
        this.dataMsgCount++;
        this.lastDataTS = Date.now();

        super.onDeviceData(deviceData)
        
        if (!this.started || this.isStopped() || this.paused)
            return;

        if ( !this.ivDataTimeout && this.dataMsgCount>0) {        
            this.startDataTimeoutCheck()
        }

        try {
            const logData = this.getLogData(deviceData, ['PairedDevices','RawData']);
            this.logger.logEvent( {message:'onDeviceData',data:logData})

            if (!this.canSendUpdate()) 
                return;
            
            // transform data into internal structure of Cycling Modes
            let incyclistData = this.mapToCycleModeData(deviceData)      

            // let cycling mode process the data
            incyclistData = this.getCyclingMode().updateData(incyclistData);   

            // transform data into structure expected by the application
            this.data =  this.transformData(incyclistData);                          

            this.emitData(this.data)
        }
        catch ( err) {            
            // istanbul ignore next
            this.logger.logEvent({message:'error',fn:'onDeviceData()',error:err.message||err, stack:err.stack})
        }
    }

    canSendUpdate(): boolean {
        if (!this.hasDataListeners() || this.paused) return false;
        return super.canSendUpdate()
    }

    mapToCycleModeData(deviceData:FitnessEquipmentSensorState) : IncyclistBikeData {
        // update data based on information received from ANT+FE sensor
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

        data.speed = (deviceData.VirtualSpeed!==undefined ? deviceData.VirtualSpeed : (deviceData.RealSpeed||0))*3.6;
        data.slope = (deviceData.Incline!==undefined? deviceData.Incline :data.slope);
        data.power = (deviceData.InstantaneousPower!==undefined? deviceData.InstantaneousPower :data.power);
        data.time  = (deviceData.ElapsedTime!==undefined ? deviceData.ElapsedTime : data.time)
        data.pedalRpm = (deviceData.Cadence!==undefined? deviceData.Cadence :data.pedalRpm) ;
        data.isPedalling = data.pedalRpm>0 || (data.pedalRpm===undefined && data.power>0);

        return data;
    }

    transformData( bikeData:IncyclistBikeData): FitnessEquipmentSensorData {

        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance =  bikeData.distanceInternal-this.distanceInternal
        }
        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        

        const data: FitnessEquipmentSensorData = {
            speed: bikeData.speed,
            slope: bikeData.slope,
            power: bikeData.power!==undefined ? Math.round(bikeData.power) : undefined,
            cadence: bikeData.pedalRpm!==undefined ? Math.round(bikeData.pedalRpm) : undefined,
            heartrate: bikeData.heartrate!==undefined ?  Math.round(bikeData.heartrate) : undefined,
            distance,
            timestamp: Date.now()
        };

        return data;
    }



    async start( props?: any ): Promise<any> {
        const wasPaused = this.paused 
        this.startProps = props||{};


        if (wasPaused)
            this.resume()

        if (this.started && !wasPaused) {
            return true;
        }


        
        const connected = await this.connect()
        if (!connected)
            throw new Error(`could not start device, reason:could not connect`)


        this.logEvent( {message:'starting device', props, isStarted: this.started, isReconnecting: this.isReconnecting})

        const opts = props || {} as any;
        const {args ={}, user={}} = opts;


        return new Promise ( async (resolve, reject) => {


            const {startupTimeout=20000, reconnectTimeout=2000} = props||{}

            const totalTimeout = Math.min( startupTimeout+10000, startupTimeout*2);

            let to ;
            const stopTimeoutCheck = ()=>{
                if (to) {
                    clearTimeout(to)
                    to = null;
                }
            }

            to = setTimeout( async ()=>{
                //await this.stop();
                reject(new Error(`could not start device, reason:timeout`))
                this.started = false
                to = null;

            }, totalTimeout)


            this.setFEDefaultTimeout() // set Timeout for a resonse of a Acknowledge message

            let success = false;
            let status = { userSent: false, slopeSent:false}
            let retry =0;
            let hasData = false;

            while (!success && retry<MAX_RETRIES) {
                retry++;

                if (!this.sensorConnected) {
                    this.logEvent( {message:'start sensor', props })
                    this.sensorConnected = await this.ant.startSensor(this.sensor,this.onDeviceData.bind(this))
                    

                    if (this.sensorConnected) {
                        this.logEvent( {message:'sensor started', props })
                    }
                }

                // on initial connection we wait for data before trying to send commands
                if (this.sensorConnected && !hasData) {
                    try {
                        await this.waitForData(startupTimeout)
                        hasData = true;
                    }
                    catch (err) {
                        stopTimeoutCheck();
                        try {
                            await await this.ant.stopSensor(this.sensor)                        
                            this.sensorConnected = false
                        }
                        catch {}        
                        this.started = false;

                        return reject(new Error('could not start device, reason:no data received'))
                    }
                }
                status = { userSent: false, slopeSent:false}
                

                if (!hasData) {
                    await sleep(reconnectTimeout)
                    continue
                }

                if (!this.isReconnecting) {
                    try {
                        const fe = this.sensor as FitnessEquipmentSensor;
        
                        const mode = this.getCyclingMode()
                        const bikeType = mode ? mode.getSetting('bikeType').toLowerCase() : 'race';
                        const defaultBikeWeight = bikeType==='mountain' ? DEFAULT_BIKE_WEIGHT_MOUNTAIN : DEFAULT_BIKE_WEIGHT; 
                        const userWeight = args.userWeight || user.weight ||DEFAULT_USER_WEIGHT;
                        const bikeWeight = args.bikeWeight||defaultBikeWeight;

                        status.userSent = status.userSent || await fe.sendUserConfiguration( userWeight, bikeWeight, args.wheelDiameter, args.gearRatio);
                        if (!status.slopeSent) {

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
        
                    }
                    catch(err) {
                        this.logger.logEvent( { message:'sending FE message error', error:err.message })
                        this.started = false;                
                    }
                    success = status.userSent && status.slopeSent    
                }
                else {
                    success = true;
                }
                
            }

            
            if (success) {
                this.logEvent( {message:'start success'})
                this.started = true;
                stopTimeoutCheck()
                resolve(true)
            }
            else {
                this.logEvent( {message:'start failed'})                
                stopTimeoutCheck()
                if (!hasData) {          
                    reject(new Error('could not start device, reason: no data received'))
                }
                else if (this.sensorConnected) {                    
                    reject(new Error('could not start device, reason: could not send FE commands'))
                }
                else { 
                    reject(new Error('could not start device, reason: could not connect'))
                }
                this.started = false;

            }
    
        })
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
        this.logger.logEvent( {message:'reconnect to device'})

        this.isReconnecting = true;
        try {
           
            await this.stop();
            await this.start(this.startProps)
            this.started = true;
            this.isReconnecting = false;
            this.logger.logEvent( {message:'reconnect success'})
            return true;
        }
        catch(err) {
            this.logger.logEvent( {message:'reconnect failed'})
            this.isReconnecting = false;
            return false;
        }


    }

    async sendInitCommands():Promise<boolean> {
        if (this.started && !this.stopped) {
            try {
                if (this.getCyclingMode() instanceof AntFeERGCyclingMode) {
                
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