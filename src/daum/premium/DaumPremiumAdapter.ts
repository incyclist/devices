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

        this.initData();        
        return runWithRetries( async ()=>{
            try {
                console.log('~~~ connected? ',this.bike.isConnected())
                if(!this.bike.isConnected()) {
                    console.log('~~~ saveConect()')
                    await this.bike.saveConnect();
                }
                console.log('~~~ setGear()')
                const gear = await this.bike.setGear( this.data.gear || ( opts.gear ||10 ));    
                return gear;
            }
            catch(err) {
                throw( new Error(`could not start device, reason:${err.message}`));
            }

        }, 3, 1000 )
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

    updateData( data,bikeData) {
        data.isPedalling = bikeData.cadence>0;
        data.power  = bikeData.power
        data.pedalRpm = bikeData.cadence
        data.speed = bikeData.speed
        data.heartrate = bikeData.heartrate
        data.distance = bikeData.distance/1000
        data.distanceInternal = bikeData.distance;
        data.time = bikeData.time
        data.gear = bikeData.gear
        
        if (this.bike.processor!==undefined) {
            data = this.bike.processor.getValues(data);
        }
        return data;
    }



}




