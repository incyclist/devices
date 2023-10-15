import { EventLogger } from 'gd-eventlog';
import SerialInterface from '../../base/serial-interface';
import {runWithRetries, sleep} from '../../../utils/utils';
import DaumAdapter from '../DaumAdapter'
import Daum8i from './comms';

import { DaumPremiumDeviceProperties } from './types';
import { SerialDeviceSettings,SerialInterfaceType,SerialCommProps } from "../../types";
import { User,INTERFACE,ControllerConfig,IncyclistBikeData } from '../../../types';

import DaumClassicCyclingMode from '../../../modes/daum-premium-standard';
import ERGCyclingMode from '../../../modes/daum-erg';
import SmartTrainerCyclingMode from '../../../modes/daum-smarttrainer';
import DaumPowerMeterCyclingMode from '../../../modes/daum-power';

const PROTOCOL_NAME = "Daum Premium"
const DAUM_PREMIUM_DEFAULT_PORT= 51955;
const START_RETRY_TIMEOUT = 1500;
const DEFAULT_GEAR = 10;
const START_RETRIES = 5

export default class DaumPremiumAdapter extends DaumAdapter<SerialDeviceSettings,DaumPremiumDeviceProperties,Daum8i>{

    static NAME = PROTOCOL_NAME;
    protected static controllers: ControllerConfig = {
        modes: [ERGCyclingMode,SmartTrainerCyclingMode,DaumPowerMeterCyclingMode,DaumClassicCyclingMode],
        default:ERGCyclingMode
    }

    commProps: SerialCommProps    

    constructor ( settings:SerialDeviceSettings,props?:DaumPremiumDeviceProperties) {

        super(settings,props)
        

        const logger  = new EventLogger('DaumPremium')
        const commProps:SerialCommProps = {...this.getBikeProps(settings), logger}    

        this.comms      = new Daum8i(commProps);        
        this.logger     = logger;

        this.initData();
    }


    getBikeProps( props:SerialDeviceSettings)  {
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
    
    getInterface():string {
        return this.comms?.getInterface();
    }

    getProtocolName(): string {
        return PROTOCOL_NAME
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

    async performCheck():Promise<boolean> {

        var info = {} as any

        return new Promise(  async (resolve, reject ) => {
            this.logEvent( {message:"checking device",port:this.getPort()});

            try {   
                await this.stop()             
                
                const connected = await this.connect();
                if (!connected)
                    resolve(false)

                this.stopped = false;
                this.started = false;
                this.paused = false;

                info.deviceType = await this.comms.getDeviceType()
                info.version = await this.comms.getProtocolVersion();

                this.logEvent( {message:"checking device success",port:this.getPort(),info});

                this.pause()
                resolve(true)
            }
            catch (err) {
                this.logEvent( {message:"checking device failed", port:this.getPort(), reason:err.message});
                resolve(false)
            }
        })
    }

    getStartRetries() {
        return START_RETRIES
    }

    getStartRetryTimeout() {
        return START_RETRY_TIMEOUT
    }

    async performStart(props:DaumPremiumDeviceProperties={},_isRelaunch:boolean=false) {

        // relaunch argument will be ignored: we will always perform a fresh start, as we might have to upload the route data as part of the start procedure

        this.setBikeProps(props)
        this.initData();   
    
        // Always stop, even in case of relaunch
        await this.stop();
        var info = {} as any

        await runWithRetries( async ()=>{
           
            try {
                
                info.connected = await this.connect();
                if (!info.connected)
                    throw new Error('not connected')

                if (!info.deviceType) {
                    info.deviceType = await this.getComms().getDeviceType()
                }
                if (!info.version) {
                    info.version = await this.getComms().getProtocolVersion();
                }

                const user: User = this.getUser()
                const {route,onStatusUpdate,gear} = props

                if ( this.requiresProgramUpload() ) {
                    const bikeType = this.getCyclingMode().getSetting('bikeType')
            
                    if (!info.upload) {
                        info.upload = await this.getComms().programUpload( bikeType, route, onStatusUpdate);
                        if (!info.upload)
                            throw new Error('Epp Upload failed')
                    }
                    
                    if (!info.started) {
                        const programId = route ? route.programId : 0;
                        info.started = await this.getComms().startProgram( programId);             
                        if (!info.started) {
                            throw new Error('Epp start failed')
                        }
                    }

                }
                

                if (!info.person && this.getCyclingMode().getModeProperty('setPersonSupport') ) { 
                    info.person = await this.getComms().setPerson(user);
                }

                if (!this.getCyclingMode().getModeProperty('eppSupport')) {
                    info.gear = await this.getComms().setGear( this.deviceData.gear || gear || DEFAULT_GEAR);                       
                }
                return;
            }
            catch(err) {
                // reconnect if very first request was failing
                if (info.connected && !info.deviceType) {
                    await sleep(500)
                    await this.reconnect()                   
                }

                throw( err);
            }

        }, this.getStartRetries(), this.getStartRetryTimeout() )


        this.stopped = false;
        this.paused = false;
        this.started = true;

        this.startUpdatePull();
        return true;

    }

    requiresProgramUpload():boolean {
        if (!this.getCyclingMode())
            return false;

        return this.getCyclingMode().getModeProperty('eppSupport')
    }


    async getCurrentBikeData():Promise<IncyclistBikeData> {       
        await this.verifyConnection()        
        return this.getComms().getTrainingData()
    }

    async getDeviceInfo():Promise<any> {
        const deviceType = await this.getComms().getDeviceType()
        const version = await this.getComms().getProtocolVersion();
        return {deviceType,version}
    }


}


