
import { EventLogger } from 'gd-eventlog';
import AntAdapter from '../AntAdapter';
import { AntProtocol } from '../AntScanner';
import {getBrand} from '../utils'


export default class AntHrmAdapter extends AntAdapter {

    constructor( DeviceID,port,stick, protocol) {
        super(protocol)

        this.logger = new EventLogger('Ant+Hrm')
        this.deviceID = DeviceID;
        this.port = port;
        this.stick = stick;
        this.deviceData = {
            DeviceID
        }
        this.data = {}
    }

    isBike() { return false;}
    isHrm() { return true;}
    isPower() { return false; }
   
    getProfile() {
        return 'Heartrate Monitor'
    }

    getName() {
        return `Ant+Hrm ${this.deviceID}`        
    }

    getDisplayName() {
        const {DeviceID,manID,ComputedHeartRate} = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';
        return `${getBrand(manID)} Hrm ${DeviceID}${hrmStr}`
    }

    onDeviceData( deviceData) {
        this.deviceData = deviceData;
        try {
            if ( this.onDataFn && !this.ignoreHrm && !this.paused) {
                if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {
                    console.log( '~~deviceData',deviceData)

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


    async start() {
        this.logger.logEvent({message:'start()'});        

        return new Promise( async (resolve,reject) => {
            if(this.ignoreHrm)
                resolve(false)

        const Ant = this.getProtocol().getAnt();
        const protocol = this.getProtocol() as AntProtocol;

        protocol.attachSensors(this,Ant.HeartRateSensor,'hbData')
            .then(()=>resolve(true))
            .catch(err=>reject(err))
        })
    }


    stop(): Promise<boolean>  {
        this.logger.logEvent({message:'stop()'});        


        return new Promise( async (resolve,reject) => {
            if(this.ignoreHrm)    
                return resolve(false)

            try {
                const protocol = this.getProtocol() as AntProtocol;
                await protocol.detachSensor(this);
                resolve(true)
            }
            catch( err) 
            {
                reject(err);
            }                
            
        });
    }
    

}