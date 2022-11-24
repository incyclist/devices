import { ISensor } from "incyclist-ant-plus";
import AntAdapter from "./ant-device";
import AntProtocol from "./incyclist-protocol";
import {getBrand} from '../ant/utils'
import { EventLogger } from "gd-eventlog";
import CyclingMode, { IncyclistBikeData } from '../cycling-mode';
import PowerMeterCyclingMode from "../modes/power-meter";
import { DeviceData } from "../device";

export default class AntPwrAdapter extends AntAdapter{
    
    protected started: boolean = false;
    protected logger: EventLogger
    protected mode: CyclingMode;
    protected distanceInternal?: number;

    constructor( sensor:ISensor, protocol: AntProtocol) {
        super(sensor,protocol)
        this.deviceData = {
            DeviceID: sensor.getDeviceID()
        }       
        this.logger = new EventLogger('Ant+PWR')
    }

    isBike() { return true;}
    isHrm() { return false;}
    isPower() { return true; }

    getName() {
        const deviceID = this.sensor.getDeviceID();
        return `Ant+PWR ${deviceID}`        

    }

    getDisplayName() {
        const {DeviceID,ManId} = this.deviceData;
        return `${getBrand(ManId)} PWR ${DeviceID}`
    }

    getCyclingMode(): CyclingMode {
        if (!this.mode)
            this.mode =  this.getDefaultCyclingMode();
        return this.mode

    }
    getDefaultCyclingMode(): CyclingMode {
        return new PowerMeterCyclingMode(this);
    }

    getSupportedCyclingModes(): any[] {
        return [PowerMeterCyclingMode]
    }

    getLogData(data, excludeList) {
        
        const logData  = JSON.parse(JSON.stringify(data));
        excludeList.forEach( (key) => {
            delete logData[key] })
        return logData;
    }

    onDeviceData(deviceData) {
        if (!this.started)
            return;

        this.deviceData = deviceData;
        this.lastDataTS = Date.now();
        if (!this.ivDataTimeout) 
            this.startDataTimeoutCheck()

        
        try {
            if ( this.onDataFn && !(this.ignoreBike && this.ignorePower) && !this.paused) {
                if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {
                    const logData = this.getLogData(deviceData, ['PairedDevices','RawData']);
                    this.logger.logEvent( {message:'onDeviceData',data:logData})

                    // transform data into internal structure of Cycling Modes
                    let incyclistData = this.mapData(deviceData)              
                    
                    // let cycling mode process the data
                    incyclistData = this.getCyclingMode().updateData(incyclistData);                    

                    // transform data into structure expected by the application
                    const data =  this.transformData(incyclistData);
                    
                    
                    this.onDataFn(data)
                    this.lastUpdate = Date.now();
                }
            }    
        }
        catch ( err) {
        }    }

        sendUpdate(request) {
            if( this.paused)
            return
    
            // nothing required to be sent to the device, but calling the Cycling Mode to adjust slope
            this.getCyclingMode().sendBikeUpdate(request) 
        }   
    
        mapData( deviceData): IncyclistBikeData {
    
            // update data based on information received from ANT+PWR sensor
            const data = {
                    isPedalling: false,
                    power: 0,
                    pedalRpm: 0,
                    speed: 0,
                    heartrate:0,
                    distanceInternal:0,        // Total Distance in meters             
                    slope:undefined,
                    time:undefined
            }
    
            data.slope = (deviceData.Slope!==undefined? deviceData.Slope :data.slope);
            data.power = (deviceData.Power!==undefined? deviceData.Power :data.power);
            data.pedalRpm = (deviceData.Cadence!==undefined? deviceData.Cadence :data.pedalRpm) ;
            data.time = (deviceData.TimeStamp!==undefined? deviceData.TimeStamp :data.time);
            data.isPedalling = data.pedalRpm>0;
    
    
            return data;
        }
    
    
        transformData( bikeData:IncyclistBikeData): DeviceData {
            
            if ( bikeData===undefined)
                return;
        
            let distance=0;
            if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
                distance = bikeData.distanceInternal-this.distanceInternal
            }
            if (bikeData.distanceInternal!==undefined)
                this.distanceInternal = bikeData.distanceInternal;
            
    
            let data =  {
                speed: bikeData.speed,
                slope: bikeData.slope,
                power: bikeData.power,
                cadence: bikeData.pedalRpm,
                distance,
                timestamp: Date.now()
            } as any;
    
            if (this.ignorePower) { 
                delete data.power;
                delete data.cadence;
            }
            if (this.ignoreBike) {
                data = {};
            }
    
            return data;
        }
    

    async start( props?: any ): Promise<any> {
        if (this.started)
            return true;

        super.start(props);

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
            resolve(this.started)
    
        })
    }

    async stop(): Promise<boolean>  {

        const stopped = await this.ant.stopSensor(this.sensor)
        super.stop()

        this.started = false;
        return stopped
    }

}