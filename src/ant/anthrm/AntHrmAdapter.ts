
import { EventLogger } from 'gd-eventlog';
import AntAdapter from '../AntAdapter';
import { AntProtocol } from '../AntScanner';
import {getBrand} from '../utils'

const DEFAULT_START_TIMEOUT = 5000;

export default class AntHrmAdapter extends AntAdapter {

    started: boolean;
    starting: boolean;

    constructor( DeviceID,port,stick, protocol) {
        super(protocol)

        this.logger = new EventLogger('Ant+Hrm')
        this.deviceID = DeviceID;
        this.port = port;
        this.stick = stick;
        this.paused = false;
        this.deviceData = {
            DeviceID
        }
        this.data = {}

        this.started = false;
        this.starting = false;
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
        if (!this.started)
            return;

        this.deviceData = deviceData;
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


    async start(props = {} as any) {
        this.logger.logEvent({message:'start()'});        

        return new Promise( async (resolve,reject) => {
            if(this.ignoreHrm)
                resolve(false)

            if (this.starting) {
                this.logger.logEvent({message:'start() not done: bike starting'});        
                return resolve(false)
            } 

            if ( this.started) {
                this.logger.logEvent({message:'start() done: bike was already started'});        
                return resolve(true);
            }
    
            this.starting = true;
            const Ant = this.getProtocol().getAnt();
            const protocol = this.getProtocol() as AntProtocol;

            let start = Date.now();
            let timeout = start + (props.timeout || DEFAULT_START_TIMEOUT);
            const iv = setInterval( ()=>{
                if ( Date.now()>timeout) {
                    clearInterval(iv);
                    this.starting = false;                    
                    reject( new Error('timeout'))
                }
            }, 100)


            protocol.attachSensors(this,Ant.HeartRateSensor,'hbData')
                .then(()=> {
                    this.starting = false;      
                    this.started = true;
                    clearInterval(iv)
                    resolve(true)
                })
                .catch(err=>reject(err))
        })
    }


    stop(): Promise<boolean>  {
        this.logger.logEvent({message:'stop()'});        


        return new Promise( async (resolve,reject) => {
            this.started = false;

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