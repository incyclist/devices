import { EventLogger } from 'gd-eventlog';
import { INTERFACE } from '../../../types/device';
import { SerialInterface } from '../..';
import { SerialDeviceSettings } from '../../adapter';
import { SerialCommProps } from '../../comm';
import { SerialInterfaceType } from '../../serial-interface';
import { User } from '../../../types/user';
import {runWithRetries, sleep} from '../../../utils/utils';
import DaumAdapter from '../DaumAdapter'
import Daum8i from './comms';
import DaumClassicCyclingMode from './modes/daum-classic';
import { Daum8iDeviceProperties } from './types';
import { IncyclistBikeData } from '../../..';

const PROTOCOL_NAME = "Daum Premium"
const DAUM_PREMIUM_DEFAULT_PORT= 51955;
const START_RETRY_TIMEOUT = 1500;
const DEFAULT_GEAR = 10;



const getBikeProps = ( props:SerialDeviceSettings) => {
    const {host,port=DAUM_PREMIUM_DEFAULT_PORT,interface: ifaceName} = props;
    let serial;

    if (ifaceName && typeof ifaceName ==='string') {        
        serial = SerialInterface.getInstance({ifaceName})
    }
    else {
        serial = props.interface
    }

    if (!serial || !serial.binding)
        throw new Error(`unknonwn interface: ${ifaceName}`)

    if (serial.getName()===SerialInterfaceType.TCPIP) {
        const path = `${host}:${port}`        
        return {serial, path}

    }
    else {
        const path = `${port}` ;
        return {serial, path}

    }
}


export default class DaumPremiumAdapter extends DaumAdapter<SerialDeviceSettings,Daum8iDeviceProperties>{

    static NAME = PROTOCOL_NAME;

    commProps: SerialCommProps
    _startRetryTimeout = START_RETRY_TIMEOUT;
    

    constructor ( settings:SerialDeviceSettings,props?:Daum8iDeviceProperties) {

        const logger  = new EventLogger('DaumPremium')
        const commProps:SerialCommProps = {...getBikeProps(settings), logger}
        const bike = new Daum8i(commProps)
        
        super(settings,props)

        this.bike       = bike;        
        this.logger     = logger;
        this.ignoreHrm      = false;
        this.ignorePower    = false;
        this.ignoreBike     = false;

        this.iv         = undefined;
        this.distanceInternal = undefined;

        this.initData();
    }

    getName() {
        return 'Daum8i'
    }
    getUniqueName(): string {
        if (this.getInterface()==='tcpip') {
            const port = this.getPort()
            const [host] = port.split(':')
            return `${this.getName()} (${host})`
        }
        return super.getUniqueName()
    } 
    
    getPort() {
        return this.bike.getPort();
    }

    getInterface():string {
        return this.bike?.getInterface();
    }

    getProtocolName(): string {
        return PROTOCOL_NAME
    }
    getSerialInterface():SerialInterface {
        return this.bike?.serial
    }

    isEqual(settings: SerialDeviceSettings): boolean {

        if (this.getInterface()===INTERFACE.TCPIP) {

            const as = this.settings as SerialDeviceSettings

            if (settings.interface!==this.getInterface())
                return false
            if (settings.protocol!==as.protocol)
                return false;        
            if ((settings.port||DAUM_PREMIUM_DEFAULT_PORT)!==(as.port||DAUM_PREMIUM_DEFAULT_PORT))
                return false;           
    
            return (settings.host ===as.host);
        }
        else {
            return super.isEqual(settings)
        }
        
    }


    getSupportedCyclingModes() : Array<any> {         
        const supported = super.getSupportedCyclingModes();
        supported.push( DaumClassicCyclingMode);
        return supported
    }    

    async check():Promise<boolean> {

        var info = {} as any

        //if (this.isStopped())
        //    return false;

        return new Promise(  async (resolve, reject ) => {
            this.logEvent( {message:"checking device",port:this.getPort()});

            try {                
                await this.bike.close()
                const connected = await this.connect();
                if (!connected)
                    resolve(false)

                info.deviceType = await this.bike.getDeviceType()
                info.version = await this.bike.getProtocolVersion();
                //await this.bike.close()

                this.logEvent( {message:"checking device success",port:this.getPort(),info});

                resolve(true)
            }
            catch (err) {
                this.logEvent( {message:"checking device failed", port:this.getPort(), reason:err.message||err});
                resolve(false)
            }

        })

    }


    async startRide(props:Daum8iDeviceProperties={}) {
        this.logEvent({message:'relaunch of device'});        
        try {
            await this.launch(props,true)
            return true;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message})
            throw err

        }

    }

    async start(props:Daum8iDeviceProperties={}) {
        this.logEvent({message:'initial start of device'});        

        try {
            await this.launch(props,false)
            return true;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message})
            throw err
        }
    }

    async launch(props:Daum8iDeviceProperties={}, isRelaunch=false) {

        const isPaused = this.isPaused()!==false
        
        this.setBikeProps(props)

        const user: User = this.user
        const {route,onStatusUpdate,gear} = props

        var info = {} as any
        this.initData();   
        
        await this.stop();
        
        return runWithRetries( async ()=>{
           

            try {
                
                const connected = await this.connect();
                if (!connected)
                    throw new Error('not connected')

                if (!info.deviceType) {
                    info.deviceType = await this.bike.getDeviceType()
                }
                if (!info.version) {
                    info.version = await this.bike.getProtocolVersion();
                }
               
                if ( this.getCyclingMode().getModeProperty('eppSupport') ) {
                    const bikeType = this.getCyclingMode().getSetting('bikeType')

                    if (!info.upload) {
                        info.upload = await this.bike.programUpload( bikeType, route, onStatusUpdate);
                        if (!info.upload)
                            throw new Error('Epp Upload failed')
                    }
                    
                    if (!info.started) {
                        const programId = route ? route.programId : 0;
                        info.started = await this.bike.startProgram( programId);             
                        if (!info.started) {
                            throw new Error('Epp start failed')
                        }
                    }

                }
                

                if (!info.person && this.getCyclingMode().getModeProperty('setPersonSupport') ) { 
                    info.person = await this.bike.setPerson(user);
                }

                if (!this.getCyclingMode().getModeProperty('eppSupport')) {
                    info.gear = await this.bike.setGear( this.cyclingData.gear || gear || DEFAULT_GEAR);                        
                }
                return;
            }
            catch(err) {
                // reconnect if very first request was failing
                if (!info.deviceType) {
                    await sleep(500)
                    await this.reconnect()                   
                }
                throw( new Error(`could not start device, reason:${err.message}`));
            }

        }, 5, this._startRetryTimeout )
        .then ( () => {

            this.stopped = false;
            this.paused = false;
            if (isPaused)
                this.resume()
            this.startUpdatePull();
            return true;
        })
    }


    async getCurrentBikeData():Promise<IncyclistBikeData> {
        
        if(!this.bike.isConnected()) {
            const connected = await this.bike.connect();
            if(!connected)
                throw new Error('not connected')
        }
        
        return this.getBike().getTrainingData()
    }

}


