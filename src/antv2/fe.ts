import { FitnessEquipmentSensor, ISensor } from "incyclist-ant-plus";

import AntAdapter from "./ant-device";
import AntProtocol from "./incyclist-protocol";
import {getBrand} from '../ant/utils'
import { EventLogger } from "gd-eventlog";
import CyclingMode, { IncyclistBikeData } from '../cycling-mode';
import AntStCyclingMode from "../ant/antfe/ant-fe-st-mode";
import AntFeERGCyclingMode from "../ant/antfe/ant-fe-erg-mode";
import AntAdvSimCyclingMode from "../ant/antfe/ant-fe-adv-st-mode";
import { sleep } from "../utils";

const DEFAULT_USER_WEIGHT = 75;
const DEFAULT_BIKE_WEIGHT = 10;
const DEFAULT_BIKE_WEIGHT_MOUNTAIN = 14.5;
const MAX_RETRIES = 3;

export default class AntFEAdapter extends AntAdapter{
    
    protected started: boolean = false;
    protected logger: EventLogger
    protected cyclingMode: CyclingMode;
    protected distanceInternal?: number;
    protected startProps : any;

    protected isReconnecting: boolean
    
    constructor( sensor:ISensor, protocol: AntProtocol) {
        super(sensor,protocol)

        this.deviceData = {
            DeviceID: sensor.getDeviceID()
        }       
        this.dataMsgCount = 0;
        this.logger = new EventLogger('Ant+FE')
        this.isReconnecting = false
    }

    isBike() { return true;}
    isHrm() { return false;}
    isPower() { return true; }

    getName() {
        const deviceID = this.sensor.getDeviceID();
        return `Ant+FE ${deviceID}`        

    }

    getDisplayName() {
        const {DeviceID,ManId} = this.deviceData;
        return `${getBrand(ManId)} FE ${DeviceID}`
    }

    getSupportedCyclingModes() : Array<any> {
        return [AntStCyclingMode,AntFeERGCyclingMode,AntAdvSimCyclingMode]
    }

    setCyclingMode(mode: string | CyclingMode, settings?: any): void {
        let selectedMode :CyclingMode;

        if ( typeof mode === 'string') {
            const supported = this.getSupportedCyclingModes();
            const CyclingModeClass = supported.find( M => { const m = new M(this); return m.getName() === mode })
            if (CyclingModeClass) {
                this.cyclingMode = new CyclingModeClass(this,settings);    
                return;
            }
            selectedMode = this.getDefaultCyclingMode();
        }
        else {
            selectedMode = mode;
        }
        this.cyclingMode = selectedMode;        
        this.cyclingMode.setSettings(settings);
        
    }
    
    getCyclingMode(): CyclingMode {
        if (!this.cyclingMode)
            this.cyclingMode =  this.getDefaultCyclingMode();
        return this.cyclingMode

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


    async sendUpdate(request) {

        // don't send any commands if we are pausing
        if( this.paused || this.isReconnecting)
            return;


        const update = this.getCyclingMode().sendBikeUpdate(request)
        this.logger.logEvent({message: 'send bike update requested', update, request})

        try {
            const fe = this.sensor as FitnessEquipmentSensor;

            const isReset = ( !update || update.reset || Object.keys(update).length===0 );
            if (isReset)
                await fe.sendTrackResistance(0)

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
    

    onDeviceData( deviceData) {

        this.dataMsgCount++;
        this.lastDataTS = Date.now();

        if (!this.started || this.isStopped())
            return;

        this.deviceData = deviceData;

        if ( this.dataMsgCount===1) {        
            this.startDataTimeoutCheck()
        }



        try {
            const logData = this.getLogData(deviceData, ['PairedDevices','RawData']);
            this.logger.logEvent( {message:'onDeviceData',data:logData})
            if ( this.onDataFn && !(this.ignoreHrm && this.ignoreBike && this.ignorePower) && !this.paused) {
                if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {

                    
                    // transform data into internal structure of Cycling Modes
                    let incyclistData = this.mapData(deviceData)      

                    // let cycling mode process the data
                    incyclistData = this.getCyclingMode().updateData(incyclistData);   

                    // transform data into structure expected by the application
                    const data =  this.transformData(incyclistData);                          

                    /*
                    this.data = this.updateData(this.data,deviceData)
                    const data = this.transformData(this.data);   
                    */

                    this.onDataFn(data)
                    this.lastUpdate = Date.now();
                }
            }    
        }
        catch ( err) {
            this.logger.logEvent({message:'error',fn:'onDeviceData()',error:err.message||err, stack:err.stack})
        }
    }

    mapData(deviceData) : IncyclistBikeData {
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

    transformData( bikeData) {

        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance =  bikeData.distanceInternal-this.distanceInternal
        }
        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        

        let data =  {
            speed: bikeData.speed,
            slope: bikeData.slope,
            power: bikeData.power!==undefined ? Math.round(bikeData.power) : undefined,
            cadence: bikeData.pedalRpm!==undefined ? Math.round(bikeData.pedalRpm) : undefined,
            heartrate: bikeData.heartrate!==undefined ?  Math.round(bikeData.heartrate) : undefined,
            distance,
            timestamp: Date.now()
        } as any;

        if (this.ignorePower) { 
            delete data.power;
            delete data.cadence;
        }
        if (this.ignoreBike) {
            data = { heartrate: data.heartrate};
        }

        if (this.ignoreHrm || !this.isHrm())  delete data.heartrate;

        return data;
    }



    async start( props?: any ): Promise<any> {
        super.start(props);

        this.startProps = props;

        this.logger.logEvent( {message:'starting device', props, isStarted: this.started, isReconnecting: this.isReconnecting})

        const opts = props || {} as any;
        const {args ={}, user={}} = opts;


        return new Promise ( async (resolve, reject) => {


            const {timeout=20000} = props||{}

            const totalTimeout = timeout+10000;

            let to ;
            const stopTimeoutCheck = ()=>{
                if (to) {
                    clearTimeout(to)
                    to = null;
                }
            }

            to = setTimeout( async ()=>{
                await this.stop();
                reject(new Error(`could not start device, reason:timeout`))
                to = null;

            }, totalTimeout)


            this.setFEDefaultTimeout() // set Timeout for a resonse of a Acknowledge message

            let success = false;
            let status = { userSent: false, slopeSent:false}
            let retry =0;
            let startSuccess = 0;

            while (!success && retry<MAX_RETRIES) {
                retry++;

                if (!this.started) {
                    this.started = await this.ant.startSensor(this.sensor,this.onDeviceData.bind(this))

                    if (this.started) {
                        startSuccess++;
                    }

                    // on initial connection we wait for data before trying to send commands
                    if (this.started && startSuccess===1) {
                        try {
                            await this.waitForData(timeout)
                        }
                        catch (err) {
                            stopTimeoutCheck();
                            try {
                                await await this.ant.stopSensor(this.sensor)                        
                            }
                            catch {}        
                            this.started = false;

                            return reject(new Error(`could not start device, reason: ${err.message}`))
                        }
                    }
                    status = { userSent: false, slopeSent:false}
                }

                if (!this.started) {
                    await sleep(2000)
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
                        status.slopeSent = status.slopeSent || await fe.sendTrackResistance(0.0)
        
        
                    }
                    catch(err) {
                        this.logger.logEvent( { message:'sending FE message error', error:err.message })
                        try {
                            await this.ant.stopSensor(this.sensor)                        
                        }
                        catch {}
                        this.started = false;                
                    }
    
                    success = status.userSent && status.slopeSent    
                }
                else {
                    success = true;
                }
                
            }

            while (success && this.dataMsgCount===0) {
                await sleep(500)
            }

            
            if (success) {
                this.logger.logEvent( {message:'start success'})
                stopTimeoutCheck()
                resolve(true)
            }
            else {
                this.logger.logEvent( {message:'start failed'})
                stopTimeoutCheck()
                if (this.started)
                    reject(new Error('could not start device, reason: could not send FE commands'))
                else 
                    reject(new Error('could not start device, reason: could not connect'))

            }
    
        })
    }

    setFEDefaultTimeout() {
        const fe = this.sensor as FitnessEquipmentSensor;
        
        fe.setSendTimeout(5000);
        
    }

    async stop(): Promise<boolean>  {
        this.logger.logEvent( {message:'stopping device'})

        let stopped = await this.ant.stopSensor(this.sensor)
        this.started = false;
        await super.stop()

        this.logger.logEvent( {message:'stopping device done', success:stopped})
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

}