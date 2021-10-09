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
        let startState = { } as any;
        let retry = 0;

        return runWithRetries( async ()=>{
            try {

                if(!this.bike.isConnected())
                    await this.bike.saveConnect();
                    
                await this.getBike().resetDevice();

                if ( !startState.setProg) {
                    await this.getBike().setProg(0);
                    startState.setProg = true;
                }
                if ( !startState.setPerson) {
                    await this.getBike().setPerson({person});
                    startState.setPerson = true;
                }
                if ( !startState.startProg) {              
                    await this.getBike().startProg();
                    startState.startProg = true;
                }
                if ( !startState.setGear) {
                    await this.bike.setGear( this.data.gear || ( opts.gear ||10 ));    
                    startState.setGear = true;
                }

                await this.bike.setPower(50);
                
                startState.checkRunData = true;
                const data = await this.bike.runData();
                if (data.power===25) {
                    throw new Error( 'invalid device response: runData');
                }
                return data;
                
            }
            catch (err) {
                if ( startState.checkRunData ) { 
                    startState = { } as any
                    retry++;
                }
                throw( new Error(`could not start device, reason:${err.message}`));
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