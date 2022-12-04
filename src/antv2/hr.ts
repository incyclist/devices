import { ISensor } from "incyclist-ant-plus";
import AntAdapter from "./ant-device";
import AntProtocol from "./incyclist-protocol";
import {getBrand} from '../ant/utils'
import { EventLogger } from "gd-eventlog";

export default class AntHrAdapter extends AntAdapter{
    
    protected started: boolean = false;
    protected logger: EventLogger

    constructor( sensor:ISensor, protocol: AntProtocol) {
        super(sensor,protocol)
        this.deviceData = {
            DeviceID: sensor.getDeviceID()
        }       
        this.logger = new EventLogger('Ant+Hrm')
    }

    isBike() { return false;}
    isHrm() { return true;}
    isPower() { return false; }

    getName() {
        const deviceID = this.sensor.getDeviceID();
        return `Ant+Hrm ${deviceID}`        

    }

    getDisplayName() {
        const {DeviceID,manID,ComputedHeartRate} = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';
        return `${getBrand(manID)} Hrm ${DeviceID}${hrmStr}`
    }

    onDeviceData(deviceData) {
        this.dataMsgCount++;
        this.lastDataTS = Date.now();

        if (!this.started)
            return;

        this.deviceData = deviceData;
        if (!this.ivDataTimeout) 
            this.startDataTimeoutCheck()

        try {
            if ( this.onDataFn && !this.ignoreHrm && !this.paused) {
                if ( this.lastUpdate===undefined || (Date.now()-this.lastUpdate)>this.updateFrequency) {
                    this.logger.logEvent( {message:'onDeviceData',data:deviceData})

                    const data = this.updateData(this.data,deviceData)
                    this.onDataFn(data)
                    this.lastUpdate = Date.now();
                }
            }    
        }
        catch ( err) {
        }
    }


    updateData( data,deviceData) {
        data.heartrate = deviceData.ComputedHeartRate;
        return data;
    }

    async start( props?: any ): Promise<any> {
        super.start(props);

        return new Promise ( async (resolve, reject) => {
            const {timeout = 20000} = props||{}
            let to ;
            if (timeout) {
                to = setTimeout( async ()=>{
                    await this.stop();
                    reject(new Error(`could not start device, reason:timeout`))
                }, timeout)
            }

            this.started = await this.ant.startSensor(this.sensor,this.onDeviceData.bind(this))

            try {
                await this.waitForData(timeout-100)
                if (to) clearTimeout(to)
                resolve(this.started)
    
            }
            catch(err) {
                // will generate a timeout
            }

    
        })
    }

    async stop(): Promise<boolean>  {
        const stopped = await this.ant.stopSensor(this.sensor)
        super.stop()

        return stopped
    }

}