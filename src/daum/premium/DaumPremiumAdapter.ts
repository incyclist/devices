import { EventLogger } from 'gd-eventlog';
import { Route } from '../../types/route';
import { User } from '../../types/user';
import {runWithRetries} from '../../utils';
import DaumAdapter from '../DaumAdapter'
import DaumClassicCyclingMode from './DaumClassicCyclingMode';

const PROTOCOL_NAME = "Daum Premium"


export default class DaumPremiumDevice extends DaumAdapter{

    static NAME = PROTOCOL_NAME;

    constructor ( protocol,bike ) {
        super(protocol,bike)

        this.bike       = bike;
        this.logger     = new EventLogger('DaumPremium')

        this.ignoreHrm      = false;
        this.ignorePower    = false;
        this.ignoreBike     = false;

        this.paused     = undefined;
        this.iv         = undefined;
        this.distanceInternal = undefined;

        this.initData();
    }

    getName() {
        return 'Daum8i'
    }

    getPort() {
        return this.bike.getPort();
    }

    getInterface() {
        return this.bike.getInterface();
    }


    getSupportedCyclingModes() : Array<any> {         
        const supported = super.getSupportedCyclingModes();
        supported.push( DaumClassicCyclingMode);
        return supported
    }    

    check() {
        var info = {} as any

        return new Promise(  async (resolve, reject ) => {
            this.logger.logEvent( {message:"check()",port:this.getPort()});

            if (this.isStopped())
                reject(new Error("device is stopped"));

            try {
                if(!this.bike.isConnected())
                    await this.bike.saveConnect();
                info.deviceType = await this.bike.getDeviceType()
                info.version = await this.bike.getProtocolVersion();
                resolve(info)               
            }
            catch (err) {
                reject(err)
            }

        })

    }

    async pause(): Promise<boolean> {
        const paused  = await super.pause()
        this.bike.pauseLogging()
        return paused
    }


    async resume(): Promise<boolean> {
        const resumed = await super.resume()
        this.bike.resumeLogging()
        return resumed
    }

    async startRide(props) {
        this.logger.logEvent({message:'relaunch of device'});        
        try {
            await this.launch(props,true)
            return true;
        }
        catch(err) {

            this.logger.logEvent({message: 'start result: error', error: err.message})
            throw new Error(`could not start device, reason:${err.message}`)

        }

    }

    async start(props) {
        this.logger.logEvent({message:'initial start of device'});        

        try {
            await this.launch(props,false)
            return true;
        }
        catch(err) {

            this.logger.logEvent({message: 'start result: error', error: err.message})
            throw new Error(`could not start device, reason:${err.message}`)

        }
    }

    async launch(props, isRelaunch=false) {
        
        const opts = props || {}

        if (opts.user && opts.user.weight)
            this.userSettings.weight = opts.user.weight;
        if (opts.bikeSettings && opts.bikeSettings.weight)
            this.bikeSettings.weight = opts.bikeSettings.weight;


        const user: User = opts.user || this.userSettings
        const route: Route = opts.route;

        var info = {} as any
        this.initData();   
        
        if (isRelaunch) {
            await this.stop();
        }
        
        return runWithRetries( async ()=>{
           

            try {
                
                if( !isRelaunch && !this.bike.isConnected()) {
                    await this.bike.saveConnect();
                }
                if (!info.deviceType) {
                    info.deviceType = await this.bike.getDeviceType()
                }
                if (!info.version) {
                    info.version = await this.bike.getProtocolVersion();
                }

                if ( this.getCyclingMode().getModeProperty('eppSupport') ) {
                    const bikeType = this.getCyclingMode().getSetting('bikeType')

                    if (!info.upload) 
                        info.upload = await this.bike.programUpload( bikeType, route, props.onStatusUpdate);
                    
                    if (!info.started) {
                        const programId = route ? route.programId : 0;
                        info.started = await this.bike.startProgram( programId);                                   
                    }

                }
                

                if (!info.person && this.getCyclingMode().getModeProperty('setPersonSupport') ) { 
                    info.person = await this.bike.setPerson(user);
                }

                if (!this.getCyclingMode().getModeProperty('eppSupport')) {
                    const gear = await this.bike.setGear( this.cyclingData.gear || ( opts.gear ||10 ));    
                    return gear;    
                }
                return;
            }
            catch(err) {
                throw( new Error(`could not start device, reason:${err.message}`));
            }

        }, 5, 1500 )
        .then ( data => {
            this.stopped = false;
            this.paused = false;
            
            this.startUpdatePull();
            return true;
        })
    }


    async getCurrentBikeData() {
        if(!this.bike.isConnected()) {
            await this.bike.saveConnect();
        }
        return this.getBike().getTrainingData()
    }




}




