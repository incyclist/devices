import { FitnessEquipmentSensor, ISensor } from "incyclist-ant-plus";

import AntAdapter from "./ant-device";
import AntProtocol from "./incyclist-protocol";
import {getBrand} from '../ant/utils'
import { EventLogger } from "gd-eventlog";
import CyclingMode, { IncyclistBikeData } from '../cycling-mode';
import AntStCyclingMode from "../ant/antfe/ant-fe-st-mode";
import AntFeERGCyclingMode from "../ant/antfe/ant-fe-erg-mode";
import AntAdvSimCyclingMode from "../ant/antfe/ant-fe-adv-st-mode";

const DEFAULT_USER_WEIGHT = 75;
const DEFAULT_BIKE_WEIGHT = 10;
const DEFAULT_BIKE_WEIGHT_MOUNTAIN = 14.5;

export default class AntFEAdapter extends AntAdapter{
    
    protected started: boolean = false;
    protected logger: EventLogger
    protected cyclingMode: CyclingMode;
    protected distanceInternal?: number;

    constructor( sensor:ISensor, protocol: AntProtocol) {
        super(sensor,protocol)
        this.deviceData = {
            DeviceID: sensor.getDeviceID()
        }       
        this.logger = new EventLogger('Ant+FE')
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
        if( this.paused)
            return;

        const update = this.getCyclingMode().sendBikeUpdate(request)
        this.logger.logEvent({message: 'send bike update requested', update, request})


        try {
            const fe = this.sensor as FitnessEquipmentSensor;

            const isReset = ( !request || request.reset || Object.keys(request).length===0 );
            if (isReset)
                await fe.sendTrackResistance(0)

            if (update.slope!==undefined) {
                await fe.sendTrackResistance(update.slope)
            }
    
            if (update.targetPower!==undefined) {
                await fe.sendTargetPower(update.targetPower)
            }
            else if (request.maxPower!==undefined) {
                if ( this.data.power && this.data.power>request.maxPower)
                    await fe.sendTargetPower(request.maxPower)
            }
            else if (request.minPower!==undefined) {
                if ( this.data.power && this.data.power<request.minPower)
                    await fe.sendTargetPower(request.minPower)
            }
        
        }
        catch( err) {
            this.logger.logEvent( {message:'sendBikeUpdate() error',error:err.message})
        }


    }
    onDeviceData( deviceData) {
        if (!this.started || this.isStopped())
            return;

        this.deviceData = deviceData;
        
        

        try {
            if ( this.onDataFn && !(this.ignoreHrm && this.ignoreBike && this.ignorePower) && !this.paused) {
                if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {
                    const logData = this.getLogData(deviceData, ['PairedDevices','RawData']);
                    this.logger.logEvent( {message:'onDeviceData',data:logData})

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
        if (this.ignoreHrm) delete data.heartrate;

        return data;
    }



    async start( props?: any ): Promise<any> {
        super.start(props);

        const opts = props || {} as any;
        const {args ={}, user={}} = opts;


        return new Promise ( async (resolve, reject) => {
            const {timeout} = props||{}
            let to ;
            if (timeout) {
                to = setTimeout( async ()=>{
                    await this.stop();
                    reject(new Error(`could not start device, reason:timeout`))
                }, timeout)
            }

            this.started = await this.ant.startSensor(this.sensor,this.onDeviceData.bind(this))
            if (to) clearTimeout(to)
            if (!this.started) {
                return reject(new Error(`could not start device`))
            }

            try {
                const fe = this.sensor as FitnessEquipmentSensor;

                const mode = this.getCyclingMode()
                const bikeType = mode ? mode.getSetting('bikeType').toLowerCase() : 'race';
                const defaultBikeWeight = bikeType==='mountain' ? DEFAULT_BIKE_WEIGHT_MOUNTAIN : DEFAULT_BIKE_WEIGHT; 
                const userWeight = args.userWeight || user.weight ||DEFAULT_USER_WEIGHT;
                const bikeWeight = args.bikeWeight||defaultBikeWeight;

                const status = { userSent: false, slopeSent:false}
                let i =0;
                while ( i<3 && !status.userSent && !status.slopeSent) {
                    status.userSent = status.userSent || await fe.sendUserConfiguration( userWeight, bikeWeight, args.wheelDiameter, args.gearRatio);
                    status.slopeSent = status.slopeSent || await fe.sendTrackResistance(0.0)
                    i++;
                }

                
                if ( status.userSent /* && status.slopeSent*/) 
                    return resolve(true)
                
                return reject(new Error(`could not start device, reason: could not send commands`))

            }
            catch(error) {
                reject(new Error(`could not start device, reason:${error.message}`))
                return;
            }
            
    
        })
    }

    async stop(): Promise<boolean>  {
        const stopped = await this.ant.stopSensor(this.sensor)
        super.stop()
        return stopped
    }

}