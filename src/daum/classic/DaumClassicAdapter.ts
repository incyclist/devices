import { EventLogger } from 'gd-eventlog';
import {runWithRetries} from '../../utils';
import DaumAdapter from '../DaumAdapter'

const PROTOCOL_NAME = "Daum Classic"

export default class DaumClassicAdapter extends DaumAdapter{

    static NAME = PROTOCOL_NAME;

    name: string;
    id: string;

    constructor ( protocol,bike ) {
        super(protocol,bike)

        this.logger     = new EventLogger('DaumClassic')
        this.name       = PROTOCOL_NAME;

        this.ignoreHrm      = false;
        this.ignorePower    = false;
        this.ignoreBike     = false;

        this.paused     = undefined;
        this.iv         = undefined;
        this.distanceInternal = undefined;

        this.initData();
    }

    setID(id) {
        this.id = id;
    }

    getID() {
        return this.id;
    }

    getName() {
        return this.name
    }

    setName(name) {
        this.name = name || PROTOCOL_NAME;
    }

    getPort() {
        return this.bike.getPort();
    }


    check() {

        var info = {} as any

        return new Promise(  async (resolve, reject ) => {
            this.logger.logEvent( {message:"check()",port:this.getPort()});
            try {

                if(!this.bike.isConnected())
                    await this.bike.saveConnect();
                
                const address = await this.bike.getAddress()
                info.bikeNo = address.bike;
                const version = await this.bike.getVersion();
                info.serialNo = version.serialNo;
                info.cockpit = version.cockpit
                this.setName('Daum '+info.cockpit);
                this.setID(info.serialNo);

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

        const person = props;

        this.initData();        
        return runWithRetries( async ()=>{

            try {
                await this.getBike().resetDevice();

                await this.getBike().setProg(0);
                await this.getBike().setPerson({person});
                await this.getBike().startProg();
                await this.bike.setGear( this.data.gear || ( opts.gear ||10 ));    

                return await this.bike.runData();
                
            }
            catch (err) {
                throw(err);
            }
        }, 5, 1000 )
        .then ( data => {
            this.startUpdatePull();
            return data;
        })
    }

    getCurrentBikeData() {
        return this.getBike().runData()
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
        
        if (this.bike.processor!==undefined) {
            data = this.bike.processor.getValues(data);
        }
        return data;
    }

}