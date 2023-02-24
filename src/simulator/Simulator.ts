import DeviceAdapter, { ControllableDevice } from '../base/adpater';

import {EventLogger} from 'gd-eventlog'
import CyclingMode, { IncyclistBikeData } from '../modes/cycling-mode';
import SimulatorCyclingMode from '../modes/simulator';
import { DeviceProperties, DeviceSettings } from '../types/device';
import { IncyclistCapability } from '../types/capabilities';
import { DeviceData } from '../types/data';

const DEFAULT_SETTINGS = { name:'Simulator',protocol:'Simulator', port: ''}
const DEFAULT_PROPS = {isBot:false }

interface SimulatorProperties extends DeviceProperties { 
    isBot?: boolean,
    settings?: any ,
    activity?: any
}

export class Simulator extends ControllableDevice {
    static NAME = 'Simulator';

    logger: EventLogger;
    speed: number;
    power: number;
    cadence: number;
    time: number;
    iv: any;
    started: boolean;
    slope: number;
    limit: any
    startProps?: any;
    cyclingMode: CyclingMode;
    startTS: number;
    data: IncyclistBikeData
    isBot: boolean;
    ignoreHrm: boolean;
    userSettings: { weight?:number};
    bikeSettings: { weight?:number};

    constructor (settings:DeviceSettings,props:SimulatorProperties=DEFAULT_PROPS) {

        
        super(settings,props);

        this.logger = new EventLogger  (Simulator.NAME)
        this.speed = 0;
        this.power = 0;
        this.cadence = 90;
        this.paused = undefined;
        this.time = undefined;
        this.iv = undefined;
        this.started = false;
        this.paused = false;
        this.slope = 0;
        this.limit = {};
        this.startTS = undefined;
        this.data = { isPedalling: false, power: 0, pedalRpm: 0, speed: 0, heartrate: 0, distanceInternal:0 }
        this.isBot = props.isBot || false;
        this.ignoreHrm = false;

        // create a fresh instance of the CycingMode processor
        const name = this.getCyclingMode().getName();        
        
        const modeSettings = this.isBot ? props.settings : this.getCyclingMode().getSettings();
        this.setCyclingMode(name,modeSettings);

        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, IncyclistCapability.Gear,
            IncyclistCapability.Control
        ]

        
    }

    isEqual(settings: DeviceSettings): boolean {
        return settings.interface===this.getInterface() && settings.name === this.settings.name
    }

    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof Simulator))
            return false;
        return true;
    }

    getID() { return Simulator.NAME }
    getName() { return Simulator.NAME }


    setIgnoreHrm(ignore) {
        this.ignoreHrm = ignore;
    }


    getSupportedCyclingModes() : Array<any> {         
        const supported = []
        supported.push(SimulatorCyclingMode);
        return supported
    }

    getDefaultCyclingMode():CyclingMode {
        return new SimulatorCyclingMode(this)        
    }

    getCyclingMode():CyclingMode {
        if (!this.cyclingMode)
            this.setCyclingMode( this.getDefaultCyclingMode());
        return this.cyclingMode;
    }

    setCyclingMode(mode: CyclingMode|string, settings?:any) { 

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




    async start(props?: SimulatorProperties):Promise<boolean>  {

        
        this.startProps = props;
        if (props)
            this.setBikeProps(props)
        

        return new Promise( (resolve) => {

            if (!this.isBot)
                this.logger.logEvent({message:'start',iv:this.iv});    
             
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


    pause(): Promise<boolean> {
        return new Promise( (resolve, reject) => {
            //const error = (data,err) => callback ? callback(data,err ) : reject(err) 
            if (!this.started)
                return reject( new Error('illegal state - pause() has been called before start()'));

            if (!this.isBot)
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

            if (!this.isBot)
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

        const startDelay = this.getCyclingMode().getSetting('delay')
        const timeSinceStart = Date.now() - this.startTS;

        if (!this.isBot && startDelay && timeSinceStart < startDelay*1000) {
            return;
        }


        const prevDist = this.data.distanceInternal;
        const d = this.data as DeviceData;
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
        } as DeviceData;

        if (this.isBot) {
            this.logger.logEvent( {message:'Coach update',prevDist, prevTime, ...data})    
        }

        this.paused = (this.data.speed===0);

        if (this.ignoreHrm) delete data.heartrate;
        
        this.emitData(data )       
    }

    canSendUpdate(): boolean {
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