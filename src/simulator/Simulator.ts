import DeviceProtocolBase,{INTERFACE} from '../DeviceProtocol';
import DeviceRegistry from '../DeviceRegistry';
import DeviceAdapter from '../Device';

import {EventLogger} from 'gd-eventlog'
import Calculations from '../calculations'

export class Simulator extends DeviceAdapter {
    static NAME = 'Simulator';

    logger: EventLogger;
    speed: number;
    power: number;
    cadence: number;
    paused: boolean;
    time: number;
    iv: any;
    started: boolean;
    slope: number;
    limit: any
    startProps?: any;

    constructor (protocol?) {
        const proto = protocol || DeviceRegistry.findByName('Simulator');
        super(proto);

        this.logger = new EventLogger  (Simulator.NAME)
        this.speed = 0;
        this.power = 0;
        this.cadence = 90;
        this.paused = undefined;
        this.time = undefined;
        this.iv = undefined;
        this.started = false;
        this.slope = 0;
        this.limit = {};
    }

    isBike() { return true;}
    isHrm() { return false;}
    isPower() { return true;}

    getID() { return Simulator.NAME }
    getName() { return Simulator.NAME }
    getPort() { return 'local'}

    start(props?: any)  {
        this.startProps = props;
        return new Promise( (resolve) => {

            this.logger.logEvent({message:'start',iv:this.iv});      
            if ( this.started) {
                return resolve({started:true, error:undefined});  
            }

            this.paused = (this.speed===0);
            this.started = true;
            this.time = Date.now();
            if ( this.iv!==undefined) {
                clearInterval(this.iv);
                this.iv=undefined;
            } 
            this.speed=30;
            this.iv = setInterval( () => this.update(), 1000);
            resolve({started:true, error:undefined});    
        })
    }

    stop(): Promise<boolean> {
        return new Promise( (resolve, reject) => {

            this.logger.logEvent({message:'stop',iv:this.iv});      
            this.started = false;
            clearInterval(this.iv);
            this.iv=undefined
            this.paused=undefined;
            resolve(true)
        })
    }


    pause(): Promise<boolean> {
        return new Promise( (resolve, reject) => {
            //const error = (data,err) => callback ? callback(data,err ) : reject(err) 
            if (!this.started)
                return reject( new Error('illegal state - pause() has been called before start()'));

            this.logger.logEvent({message:'pause',iv:this.iv});      
            this.paused = true;
            resolve(true)
        })
    }

    resume(): Promise<boolean> {
        return new Promise( (resolve, reject) => {
            //const error = (data,err) => callback ? callback(data,err ) : reject(err) 
            if (!this.started)
                reject( new Error('illegal state - resume() has been called before start()'));

            this.logger.logEvent({message:'resume',iv:this.iv});      
            this.paused = false;
            resolve(true)
        })
    }

    toggle() : Promise<boolean> {
        if ( this.started) {
            return this.stop()
        }
        else {
            return this.start().then( ()=> { return true});
        }
    }

    faster() {
        if (this.speed<15)
            this.speed += 5;
        else if (this.speed<30)
            this.speed += 3;
        else 
            this.speed+=1;

        if (this.paused && this.speed>0)
            this.paused=false;
    }

    slower() {
        if (this.speed<=15)
            this.speed -= 5;
        else if (this.speed<=30)
            this.speed -= 3;
        else 
            this.speed-=1;
    
        if ( this.speed<=0) {
            this.speed = 0;
            this.pause();
        }

    }

    update() {
        //console.log( 'Simulator:update',this.iv)
        let prevTime = this.time;
        this.time = Date.now();
        let timespan = this.time-prevTime; 

        if ( this.limit.slope) {
            this.slope = this.limit.slope
        }
        
        if ( this.speed===undefined )                 
            this.speed = 30;
        this.power = Calculations.calculatePower(75,this.speed/3.6,this.slope);    

        if ( this.limit.targetPower) {
            this.power = this.limit.targetPower;
            this.speed = Calculations.calculateSpeed(75, this.power, this.slope)
        }
        
        if ( this.limit.maxPower && this.power>this.limit.maxPower) {
            this.power = this.limit.maxPower;
            this.speed = Calculations.calculateSpeed(75, this.power, this.slope)
        }
        else if ( this.limit.minPower && this.power<this.limit.minPower) {
            this.power = this.limit.minPower;
            this.speed = Calculations.calculateSpeed(75, this.power, this.slope)
        }

        let distance = this.calculateDistance(this.speed, timespan/1000)

        let data = { speed:this.speed, cadence:Math.round(this.cadence), power:Math.round(this.power),  timespan, distance  }
        if( this.onDataFn) {
            this.onDataFn(data )
        }
        
    }
    
    calculateDistance ( speedKps, timeS) {
        return timeS*speedKps/3.6;
    }


    sendUpdate( request ) {
        this.logger.logEvent({message:'bike update request',request})

        const r = request || { refresh:true} as any
        if ( r.refresh) {
            if (Object.keys(r).length===1)
                return this.limit;
            delete r.refresh;
        }

        this.limit = r;
        return this.limit;
    }


}

export default class SimulatorProtocol extends DeviceProtocolBase{

    static NAME = 'Simulator';

    constructor () {
        super();

        this.devices.push( new Simulator(this) );
    }

    getName() {
        return SimulatorProtocol.NAME
    }
    getInterfaces() {
        return [INTERFACE.SIMULATOR]
    }
    isBike() {
        return true;
    }

    isHrm() {
        return false;
    }

    isPower() {
        return true;
    }

    getDevices() {
        return this.devices;
    }



}

// auto-instantiate & auto-register
const simulator = new SimulatorProtocol();
DeviceRegistry.register(simulator);
