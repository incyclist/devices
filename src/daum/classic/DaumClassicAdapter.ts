import { EventLogger } from 'gd-eventlog';
import CyclingMode from '../../cycling-mode';
import {runWithRetries} from '../../utils';
import DaumAdapter from '../DaumAdapter'
import DaumClassicCyclingMode from './DaumClassicCyclingMode';

const PROTOCOL_NAME = "Daum Classic"


export default class DaumClassicAdapter extends DaumAdapter{

    static NAME = PROTOCOL_NAME;

    name: string;
    id: string;
    udid: number

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

        this.udid = Date.now()

        this.logger.logEvent( {message:'Device created',udid:this.udid, port:this.getPort()})
        

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

    getSupportedCyclingModes() : Array<any> {         
        const supported = super.getSupportedCyclingModes();
        supported.push(DaumClassicCyclingMode);
        return supported
    }

    getDefaultCyclingMode():CyclingMode {
        return new DaumClassicCyclingMode(this)        
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



    check() {

        var info = {} as any

        return new Promise(  async (resolve, reject ) => {
            this.logger.logEvent( {message:"check()",port:this.getPort()});
            
            const iv = setTimeout( async () => {
                reject( new Error(`timeout`));
            },5000)

            try {
                
                if(!this.bike.isConnected())
                    await this.bike.saveConnect();
                
                const address = await this.bike.getAddress() ||  {}
                info.bikeNo = address.bike;
                const version = await this.bike.getVersion() || {}
                info.serialNo = version.serialNo;
                info.cockpit = version.cockpit
                this.setName('Daum '+info.cockpit);
                this.setID(info.serialNo);

                clearTimeout(iv);
                resolve(info)               
            }
            catch (err) {
                clearTimeout(iv);
                reject(err)
            }

        })

    }


    async startRide(props) {
        this.logger.logEvent({message:'relaunch of device',udid:this.udid});        
        return await this.launch(props,true)
    }

    async start(props) {
        this.logger.logEvent({message:'initial start of device',udid:this.udid});        
        return await this.launch(props,false)
    }

    async launch(props, isRelaunch=false) {


        try {
            if (isRelaunch) {
                await this.stop();
            }

            await this.performStart(props, isRelaunch)
        
            if (!isRelaunch) {
                try {
                    const version = await this.bike.getVersion();
                    const {serialNo,cockpit} = version || {}
                    this.logEvent({message: 'device info', deviceInfo: {serialNo,cockpit},udid:this.udid})
                }
                catch {}
            }


            this.stopped = false;
            this.paused = false;
            this.startUpdatePull();
            return true;
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, udid:this.udid})
            throw new Error(`could not start device, reason:${err.message}`)
        }

    }

    performStart(props:{user?,bikeSettings?,gear?}={}, isRelaunch=false) {
        
        this.stop();
        

        const {user,bikeSettings} = props;
        if (user && user.weight)
            this.userSettings.weight = user.weight;
        if (bikeSettings && bikeSettings.weight)
            this.bikeSettings.weight = bikeSettings.weight;

        this.initData();        

        let startState = { } as any;        
        return runWithRetries( async ()=>{
            try {
                this.logger.logEvent({message: 'start attempt',  udid:this.udid, isRelaunch, isConnected:this.bike.isConnected()})

                if (!isRelaunch && !this.bike.isConnected())
                    await this.bike.saveConnect();
                    
                await this.getBike().resetDevice();

                if ( !startState.setProg) {
                    await this.getBike().setProg(0);
                    startState.setProg = true;
                }
                if ( !startState.setPerson) {
                    await this.getBike().setPerson(user);
                    startState.setPerson = true;
                }

                if (!startState.setBikeType) {            
                    const bikeType = this.getCyclingMode().getSetting('bikeType') || 'race'                    
                    await this.getBike().setBikeType(bikeType.toLowerCase());                    
                    startState.setBikeType = true;                    
                }

                if ( !startState.startProg) {              
                    await this.getBike().startProg();
                    startState.startProg = true;
                }
                if ( !startState.setGear) {
                    await this.bike.setGear( this.cyclingData.gear || ( props.gear ||10 ));    
                    startState.setGear = true;
                }

                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendRequest(startRequest);
                
                startState.checkRunData = true;
                const data = await this.bike.runData();
                
                if (startRequest.targetPower && startRequest.targetPower!==25 && data.power===25) {
                    throw new Error( 'invalid device response: runData');
                }

                this.stopped = false;
                this.paused = false;
                this.startUpdatePull();
                
                return data;
                
            }
            catch (err) {
                this.logger.logEvent({message: 'start attempt failed',  udid:this.udid, error:err.message})
                
                if ( startState.checkRunData ) { 
                    startState = { } as any
                }
                throw( new Error(`could not start device, reason:${err.message}`));
            }
        }, 5, 1000 )
    }

    getCurrentBikeData() {
        if (this.stopped)
            return;

        return this.getBike().runData()
    }


}