import {EventLogger} from 'gd-eventlog'
import SimulatorCyclingMode from '../modes/simulator';
import IncyclistDevice from '../base/adpater';
import { IAdapter,IncyclistBikeData,DeviceProperties, DeviceSettings,IncyclistCapability,IncyclistAdapterData } from '../types';

const DEFAULT_PROPS = {isBot:false }

interface SimulatorProperties extends DeviceProperties { 
    isBot?: boolean,
    settings?: any ,
    activity?: any
}

export class Simulator extends IncyclistDevice<SimulatorProperties> {

    static NAME = 'Simulator';
    protected static controllers = {
        modes: [SimulatorCyclingMode],
        default: SimulatorCyclingMode
    }

    speed: number;
    power: number;
    cadence: number;
    time: number;
    slope: number;
    limit: any
    startProps?: any;
    startTS: number;
    data: IncyclistBikeData
    isBot: boolean;
    iv:NodeJS.Timeout
    userSettings: { weight?:number};
    bikeSettings: { weight?:number};

    constructor (settings:DeviceSettings,props:SimulatorProperties=DEFAULT_PROPS) {
      
        super(settings,props);

        this.logger = new EventLogger  (Simulator.NAME)

        this.speed = 0;
        this.power = 0;
        this.cadence = 90;
        this.time = undefined;
        this.slope = 0;
        this.limit = {};
        this.startTS = undefined;
        this.data = { isPedalling: false, power: 0, pedalRpm: 0, speed: 0, heartrate: 0, distanceInternal:0 }
        this.isBot = props.isBot || false;

        // create a fresh instance of the CycingMode processor
        const name = this.getCyclingMode().getName();        
        
        const modeSettings = this.isBot ? props.settings : this.getCyclingMode().getSettings();
        this.setCyclingMode(name,modeSettings);

        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, 
            IncyclistCapability.Control,IncyclistCapability.HeartRate
        ]

        
    }

    isEqual(settings: DeviceSettings): boolean {
        return settings.interface===this.getInterface() && settings.name === this.settings.name
    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof Simulator))
            return false;
        return true;
    }

    getID() { return Simulator.NAME }
    getName() { return Simulator.NAME }
    getUniqueName(): string { return Simulator.NAME} 
    

    async start(props?: SimulatorProperties):Promise<boolean>  {

        
        this.startProps = props;
        this.stopped = false;
        this.paused = false;

        if (props)
            this.setBikeProps(props)
        

        return new Promise( (resolve) => {

            if (!this.isBot)
                this.logEvent( {message:'starting device', device:this.getName(), props})
             
            if ( this.started) {
                return resolve(true);  
            }

            this.started = true;
            this.time = Date.now();
            this.startTS = this.time;
            if ( this.isBot) {
                this.startTS = props.activity ? Date.parse(props.activity.startTime) : this.startTS-1500;
                const sm = this.getCyclingMode() as SimulatorCyclingMode;
                sm.prevUpdateTS = this.startTS;
                this.update()
            }
            if ( this.iv!==undefined) {
                clearInterval(this.iv);
                this.iv=undefined;
            } 

            this.iv = setInterval( () => this.update(), 1000);
            if (!this.isBot)
                this.logger.logEvent({message:'started'});      
            resolve(true);    
        })
    }



    stop(): Promise<boolean> {
        return new Promise( (resolve, reject) => {

            if (!this.isBot)
                this.logger.logEvent({message:'stop',iv:this.iv});      
            this.started = false;
            clearInterval(this.iv);
            this.iv=undefined
            this.paused=undefined;
            resolve(true)
        })
    }


    async pause(): Promise<boolean> {
        
        if (!this.isBot && this.isStarted())
            this.logEvent( {message:'pausing device', device:this.getName()})
        this.paused = true;
        return true;
        
    }

    async resume(): Promise<boolean> {
        
        if (!this.isBot && this.isStarted())
            this.logger.logEvent( {message:'resuming device', device:this.getName()})
        this.paused = false;
        return true;
        
    }

    async toggle() : Promise<boolean> {
        if ( this.started) {
            return await this.stop()
        }
        else {
            await this.start();
            return true;
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

        const startDelay = this.getCyclingMode().getSetting('delay')
        const timeSinceStart = Date.now() - this.startTS;

        if (!this.isBot && startDelay && timeSinceStart < startDelay*1000) {
            return;
        }

        if (this.paused)
            return;

        const prevDist = this.data.distanceInternal;
        const d = this.data as IncyclistAdapterData;
        const prevTime = d.deviceTime;

        this.data = this.getCyclingMode().updateData(this.data);
    
        let data =  {
            speed: this.data.speed,
            slope: this.data.slope,
            power: this.data.power,
            cadence: this.data.pedalRpm,
            distance: this.data.distanceInternal-prevDist,
            heartrate: Math.round(this.data.power-10+Math.random()*20),
            timestamp: Date.now(),
            deviceTime: (Date.now()-this.startTS)/1000,
            deviceDistanceCounter: this.data.distanceInternal
        } as IncyclistAdapterData;

        if (this.isBot) {
            this.logger.logEvent( {message:'Coach update',prevDist, prevTime, ...data})    
        }
        
        this.emitData(data )       
    }

    canEmitData(): boolean {
        return true;
    }
    
    calculateDistance ( speedKps, timeS) {
        return timeS*speedKps/3.6;
    }


    sendUpdate( request ) {
        if (this.paused)
            return;

        return this.getCyclingMode().sendBikeUpdate(request)
    }

}