import { EventLogger } from 'gd-eventlog';
import {runWithRetries} from '../../utils';
import DaumAdapter from '../DaumAdapter'

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

    async start(props) {
        this.logger.logEvent({message:'start()',props});        
        
        const opts = props || {}
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
                const gear = await this.bike.setGear( this.data.gear || ( opts.gear ||10 ));    
                return gear;
            }
            catch(err) {
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




