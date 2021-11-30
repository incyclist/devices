import { EventLogger } from 'gd-eventlog';
import CyclingMode from '../CyclingMode';
import DeviceAdapterBase,{DeviceAdapter} from '../Device'
import ERGCyclingMode from './ERGCyclingMode';
import SmartTrainerCyclingMode from './SmartTrainerCyclingMode';

const DEFAULT_BIKE_WEIGHT = 10;
const DEFAULT_USER_WEIGHT = 75;


function floatVal(d) {
    if (d===undefined)
        return d;
    return parseFloat(d)
}
function intVal(d) {
    if (d===undefined)
        return d;
    return parseInt(d)
}

interface DaumAdapter  {
    getCurrentBikeData(): Promise<any>;
}

export default class DaumAdapterBase extends DeviceAdapterBase implements DeviceAdapter,DaumAdapter  {

    bike;
    ignoreHrm: boolean;
    ignoreBike: boolean;
    ignorePower: boolean;

    distanceInternal: number;
    paused: boolean;
    stopped: boolean;
    data;
    currentRequest;
    requests: Array<any>;
    iv;
    logger: EventLogger;
    cyclingMode: CyclingMode;
    userSettings: any;
    bikeSettings: any;

    constructor( props, bike) {
        super(props);
        this.bike = bike;
        this.stopped = false;
        this.paused = false;

        const options = props || {};
        this.cyclingMode = options.cyclingMode;
        this.userSettings = options.userSettings || {}
        this.bikeSettings = options.bikeSettings || {};
        this.data = {}

    }

    setCyclingMode(mode: CyclingMode) { 
        this.cyclingMode = mode;
    }


    getSupportedCyclingModes() : Array<any> {         
        return [ERGCyclingMode,SmartTrainerCyclingMode]
    }

    getCyclingMode() {
        if (!this.cyclingMode)
            this.setCyclingMode( this.getDefaultCyclingMode());
        return this.cyclingMode;
    }

    getDefaultCyclingMode   ():CyclingMode {
        return new SmartTrainerCyclingMode(this)        
    }


    setUserSettings(userSettings) {
        this.userSettings = userSettings || {}
    } 
    setBikeSettings(bikeSettings) {
        this.bikeSettings = bikeSettings|| {}
    } 

    getWeight() {
        const userWeight = this.userSettings.weight || (this.bike ? this.bike.getUserWeight(): undefined) || DEFAULT_USER_WEIGHT;
        const bikeWeight = this.bikeSettings.weight || (this.bike ? this.bike.getBikeWeight():undefined) || DEFAULT_BIKE_WEIGHT;
        return bikeWeight+userWeight;
    }

    
    getCurrentBikeData(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    getBike() {
        return this.bike;
    }

    isBike() {
        return true;
    }

    isPower() {
        return true;
    }

    isHrm() {
        return true;
    }

    setIgnoreHrm(ignore) {
        this.ignoreHrm=ignore;
    }

    setIgnoreBike(ignore) {
        this.ignoreBike=ignore;
    }

    isStopped() {
        return this.stopped;
    }

    initData() {
        this.distanceInternal = undefined;
        this.paused = undefined;
        this.data       = {
            time:0,
            slope:0,
            distance:0,
            speed:0,
            isPedalling:false,
            power:0,
            distanceInternal:0
        }
        this.currentRequest = {}
        this.requests   = [];
        if (this.bike.processor!==undefined) 
            this.bike.processor.reset();
    }

    start( props?: any ): Promise<any> {
        this.stopped = false;
        return new Promise( done => done(true))
    }

    startUpdatePull() {
        // ignore if already  started
        if (this.iv)
            return;

        // not neccessary of all device types should be ignored
        if ( this.ignoreBike && this.ignoreHrm && this.ignorePower)
            return;

        this.iv = setInterval( ()=>{
            this.update()
        } ,1000)
            
    }

    connect() {
        if(!this.bike.isConnected())
            this.bike.connect()
    }

    close() {
        return this.bike.saveClose();        
    }

    logEvent( event) {
        if (!this.logger)
            return;
        this.logger.logEvent(event);
    }

          

    stop(): Promise<boolean> {
        this.logEvent({message:'stop request'});        
        this.stopped = true;
        return new Promise( (resolve,reject) => {
            try {
                if ( this.iv) {
                    clearInterval(this.iv);
                    this.iv=undefined
                }
                this.logEvent({message:'stop request completed'});        
                this.paused=undefined;
                resolve(true);
            }
            catch (err) {
                this.logEvent({message:'stop error',error:err.message});        
                reject(err);
            }
        })
    }

    pause(): Promise<boolean> {
        return new Promise ( resolve => {
            this.paused = true;
            resolve(true)
        })
    }


    resume(): Promise<boolean> {
        return new Promise ( resolve => {
            this.paused = false;
            resolve(true)
        })

    }

    async sendUpdate(data) {
        // don't send any commands if we are pausing
        if( this.paused)
            return;
        
        this.logEvent({message:'sendUpdate',data});    
        this.requests.push(data);
    } 

    async update() {

        // don't send any commands if we are pausing
        if( this.paused)
            return;

        // check if we have some device commands in the queue
    
        // if there are no updates ( e.g. Power, Slope, ...) then add a refresh request
        if ( !this.ignoreBike) {
            if (this.requests.length===0) {
                this.sendUpdate({refresh:true})
            }  
    
            // if we have updates, send them to the device
            if (this.requests.length>0) {
                const processing  =[...this.requests];
                processing.forEach( async request => {
                    try {
                        this.logEvent({message:'bike update request',request})
                        await this.sendBikeUpdate(request);
                        this.requests.shift();
        
                    }
                    catch (err) {
                        this.logEvent({message:'bike update error',error:err.message,stack:err.stack,request})
                    }
                })
            }    
        }

        // now get the latest data from the bike
        this.getCurrentBikeData()
        .then( bikeData => {

            let prev = JSON.parse(JSON.stringify(this.data))

            // clone existing data object         

            // update Data based on information received from bike
            let data = this.updateData(prev, bikeData)

            // transform  ( rounding / remove ignored values)
            this.data = this.transformData(data);

            if ( this.onDataFn) {
                this.onDataFn(this.data)
            }
        })
        .catch(err => {
            this.logEvent({message:'bike update error',error:err.message,stack:err.stack })
        })

    }

    updateData( data,bikeData) {
        data.isPedalling = bikeData.cadence>0;
        data.power  = bikeData.power
        data.pedalRpm = bikeData.cadence
        data.speed = bikeData.speed
        data.heartrate = bikeData.heartrate
        data.distance = bikeData.distance/100
        data.distanceInternal = bikeData.distance;
        data.time = bikeData.time
        data.gear = bikeData.gear
        if (bikeData.slope) data.slope = bikeData.slope;

        this.getCyclingMode().updateData(data);
        //this.bike.processor.getValues(data);
        
        return data;
    }


    transformData( bikeData) {

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
            heartrate: intVal(bikeData.heartrate),
            distance,
            timestamp: Date.now()
        } as any;

        if (this.ignoreHrm) delete data.heartrate;
        if (this.ignorePower) { 
            delete data.power;
            delete data.cadence;
        }
        if (this.ignoreBike) {
            data = { heartrate: data.heartrate};
        }

        return data;
    }

    async sendRequest(request) {
        try {

            const bike = this.getBike();
            const isReset = ( !request || request.reset || Object.keys(request).length===0 );

            if (isReset) {
                return {};
            }
               
            if (request.slope!==undefined) {
                await bike.setSlope(request.slope);
            }
            if (request.targetPower!==undefined ) {
                await bike.setPower(request.targetPower);
            }
            return request
        
        }
        catch (err) {
            this.logEvent( {message:'error',fn:'sendRequest()',error:err.message||err})            
            return;
        }


    }


    sendBikeUpdate(request) {
        if ( request.slope) {
            this.data.slope = request.slope;
        }
        return new Promise ( async (resolve) => {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request)
            const res = await this.sendRequest(bikeRequest);            
            resolve(res);

        })
    }


}