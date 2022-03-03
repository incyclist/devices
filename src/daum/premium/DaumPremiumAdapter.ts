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

    async initClassic( route:Route) {
        if ( !route)
            return true;

        let res;
        const bikeType = this.getCyclingMode().getSetting('bikeType')

        res = await this.bike.programUpload( bikeType, route);
        if (!res)
            return false;

        res = await this.bike.startProgram( route.programId);
        if (!res)
            return false;


    }

    async start(props) {
        this.logger.logEvent({message:'start()'});        
        
        console.log('~~~setPersonSupport:',this.getCyclingMode().getModeProperty('setPersonSupport'))
        console.log('~~~eppSupport:',this.getCyclingMode().getModeProperty('eppSupport'))

        const opts = props || {}

        const user: User = opts.user || this.userSettings
        const route: Route = opts.route;

        var info = {} as any
        this.initData();        
        return runWithRetries( async ()=>{
            if (this.isStopped())
                return;

            try {
                if(!this.bike.isConnected()) {
                    await this.bike.saveConnect();
                }
                if (!info.deviceType) {
                    info.deviceType = await this.bike.getDeviceType()
                }
                if (!info.version) {
                    info.version = await this.bike.getProtocolVersion();
                }

                
                if (!info.init &&  this.getCyclingMode().getModeProperty('setPersonSupport')  ) {
                    info.init = await this.initClassic(route);
                }
                else {
                    info.init=true;
                }

                if (!info.person && this.getCyclingMode().getModeProperty('eppSupport') ) { 
                    info.person = await this.bike.setPerson(user);
                }
                else {
                    info.person = true;
                }

                if (!this.getCyclingMode().getModeProperty('eppSupport')) {
                    const gear = await this.bike.setGear( this.daumRunData.gear || ( opts.gear ||10 ));    
                    return gear;    
                }
                return;
            }
            catch(err) {
                console.error(err)
                throw( new Error(`could not start device, reason:${err.message}`));
            }

        }, 5, 1000 )
        .then ( data => {
            this.startUpdatePull();
            return data;
        })
    }


    async getCurrentBikeData() {
        if(!this.bike.isConnected()) {
            await this.bike.saveConnect();
        }
        return this.getBike().getTrainingData()
    }




}




