import { EventLogger } from 'gd-eventlog';
import AntAdapter from '../AntAdapter';
import { AntProtocol } from '../AntScanner';
import {getBrand} from '../utils'
import { IncyclistBikeData } from '../../CyclingMode';
import CyclingMode from '../../CyclingMode';
import PowerMeterCyclingMode from '../../modes/power-meter';
import { DeviceData } from '../../Device';

const floatVal = (d) => d ? parseFloat(d) :d
const intVal = (d) => d ? parseInt(d) :d
const hex = (v) =>  Math.abs(v).toString(16).toUpperCase();

const DEFAULT_START_TIMEOUT = 5000;

/*
class MockLogger {
    log(...args) { console.log('~~~~~Ant:',...args)}
    logEvent(event) { console.log('~~~~~Ant:'+event.message, event)}
}
*/
export type AntPwrData = {
	DeviceID: number;
	PedalPower?: number;
	RightPedalPower?: number;
	LeftPedalPower?: number;
	Cadence?: number;
	AccumulatedPower?: number;
	Power?: number;
	offset?: number;
	EventCount?: number;
	TimeStamp?: number;
	Slope?: number;
	TorqueTicksStamp?: number;
	CalculatedCadence?: number;
	CalculatedTorque?: number;
	CalculatedPower?: number; 
}

export default class AntFEAdapter extends AntAdapter {

    started: boolean;
    starting: boolean;
    connected: boolean;
    distanceInternal?: number;
    workerId?: any;
    currentCmd?: any;
    mode: CyclingMode;

    constructor( DeviceID,port,stick, protocol) {
        super(protocol)

        this.logger = new EventLogger('Ant+PWR')
        //this.logger = new MockLogger() as EventLogger;
        this.logger.logEvent( {message:'Ant+PWR Adapter created', DeviceID,port})

        this.deviceID = DeviceID;
        this.port = port;
        this.stick = stick;
        this.deviceData = {
            DeviceID
        }
        this.data = {}
        this.started = false;
        this.starting = false;
        this.connected = false;
        this.mode = this.getDefaultCyclingMode()
    }

    isBike() { return true;}
    isHrm() { return false;}
    isPower() { return true; }
   
    getProfile() {
        return 'Power Meter';
    }

    getName() {
        return `Ant+PWR ${this.deviceID}`        
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

    onAttached() {
        this.logger.logEvent( {message:'Device connected'})
        this.connected = true;

    }

    getLogData(data, excludeList) {
        
        const logData  = JSON.parse(JSON.stringify(data));
        excludeList.forEach( (key) => {
            delete logData[key] })
        return logData;

    }


    onDeviceData( deviceData: AntPwrData) {
        if (!this.started || this.isStopped())
            return;
        this.deviceData = deviceData;
        
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
        }
    }

    onDeviceEvent(data) {
        try {

            const cmdInfo = this.currentCmd;
            if (!cmdInfo)
                return;

            const msg = cmdInfo.msg.readUInt8(2);
            const Constants = this.getProtocol().getAnt().Constants;
            const {expectedResponse} = cmdInfo;

            if ( data.message===msg) {
                if ( expectedResponse===undefined && data.code===Constants.EVENT_TRANSFER_TX_COMPLETED) {
                    this.currentCmd.response = { success:true,message:hex(data.message),code:hex(data.code)  }
                    return;
                }
    
                if ( expectedResponse===undefined && data.code!==Constants.EVENT_TRANSFER_TX_COMPLETED) {
                    this.currentCmd.response = { success:false,message:hex(data.message),code:hex(data.code) }
                    return;
                }
            }

            if ( data.message===1) {
                if ( expectedResponse!==undefined && data.code===expectedResponse) {
                    this.currentCmd.response = { success:true,message:hex(data.message),code:hex(data.code) }
                    return;
                }
                if ( expectedResponse===undefined && (data.code===Constants.EVENT_TRANSFER_TX_COMPLETED || data.code===3) ) {
                    this.currentCmd.response = { success:true,message:hex(data.message),code:hex(data.code)  }
                    return;
                }    
                if ( data.code===Constants.EVENT_TRANSFER_TX_FAILED || data.code===Constants.EVENT_CHANNEL_COLLISION)  { 
                    //this.stick.write(this.currentCmd.msg);
                    this.currentCmd.response = { success:false,message:hex(data.message),code:hex(data.code)  }
                    return;
                }
            }

            if ( this.currentCmd!==undefined && data.message===Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA && data.code===31) {
                this.logger.log("could not send (TRANSFER_IN_PROGRESS)");
                this.currentCmd.response = { success:false,message:hex(data.message),code:hex(data.code)  }
                return;
            }
            this.logger.logEvent({message:"Incoming Event ", event:  {message:hex(data.message),code:hex(data.code)} } );
    
        }
        catch (err) {
            this.logger.logEvent({message:'Error',fn:'parseEvent',event:{message:hex(data.message),code:hex(data.code)} ,error:err.message||err})
        }
    }

    sendUpdate(request) {
        if( this.paused)
        return

        // nothing required to be sent to the device, but calling the Cycling Mode to adjust slope
        this.getCyclingMode().sendBikeUpdate(request) 
    }   

    mapData( deviceData: AntPwrData): IncyclistBikeData {

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
            distance = intVal(bikeData.distanceInternal-this.distanceInternal)
        }
        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        

        let data =  {
            speed: floatVal(bikeData.speed),
            slope: floatVal(bikeData.slope),
            power: intVal(bikeData.power),
            cadence: intVal(bikeData.pedalRpm),
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
        
        await super.start(props);

        this.logger.logEvent({message:'start()',props});        
        const opts = props || {} as any;
        const {args ={}} = opts;
        
        return new Promise( async (resolve,reject) => {
            if(this.ignoreBike && this.ignorePower) {
                this.logger.logEvent({message:'start() not done: bike disabled'});        
                return resolve(false)
            }

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
            let timeout = start + (args.timeout || DEFAULT_START_TIMEOUT);
            const iv = setInterval( ()=>{
                if ( Date.now()>timeout) {
                    clearInterval(iv);
                    this.starting = false;                    
                    reject( new Error('timeout'))
                }
                if (this.isStopped()) {
                    clearInterval(iv);
                    this.starting = false;                    
                    reject( new Error('stopped'))
                }
            }, 100)


            protocol.attachSensors(this,Ant.BicyclePowerSensor,'powerData')
                .then(()=> {
                    this.starting = false;      
                    this.started = true;
                    clearInterval(iv)
                    resolve(true)
                })
                .catch(err=>reject(err))
        })
    
    }

    
    async stop(): Promise<boolean>  {

        await super.stop();
    
        this.logger.logEvent({message:'stop()'});        


        return new Promise( async (resolve,reject) => {

            //Workaround: proper closing does not work -> when trying to re-open, the sensor does not get attached
            
            this.starting = false;
            return resolve(true);
            /*
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
            */               
            
        });
    }

    
    /*
    ====================================== Commands ==============================================
    */
    
}


