import { EventLogger } from 'gd-eventlog';
import {runWithRetries, waitWithTimeout} from '../../../utils/utils';
import DaumAdapter from '../DaumAdapter'
import DaumClassicCyclingMode from '../../../modes/daum-classic-standard';

import { DaumClassicProperties, DaumClassicStartInfo } from './types';
import { SerialDeviceSettings,SerialCommProps } from "../../types";
import { IncyclistBikeData,ControllerConfig,User } from "../../../types";
import Daum8008 from './comms';
import SerialInterface from '../../base/serial-interface';
import ERGCyclingMode from '../../../modes/daum-erg';
import SmartTrainerCyclingMode from '../../../modes/daum-smarttrainer';
import DaumPowerMeterCyclingMode from '../../../modes/daum-power';
import { PROTOCOL_NAME, DEFAULT_GEAR } from './consts';

export default class DaumClassicAdapter extends DaumAdapter<SerialDeviceSettings, DaumClassicProperties,Daum8008>{

    static NAME = PROTOCOL_NAME;
    protected static controllers: ControllerConfig = {
        modes: [ERGCyclingMode,SmartTrainerCyclingMode,DaumPowerMeterCyclingMode,DaumClassicCyclingMode],
        default:DaumClassicCyclingMode
    }

    protected name: string;
    protected id: string;

    constructor ( settings:SerialDeviceSettings,props?:DaumClassicProperties) {
        super(settings,props)

        const logger     = new EventLogger('DaumClassic')
        const commProps:SerialCommProps = {...this.getBikeProps(settings), logger}

        this.comms = new Daum8008( commProps )
        this.logger         = logger;
        this.name           = PROTOCOL_NAME;

        this.initData();
    }

    getBikeProps ( props:SerialDeviceSettings): SerialCommProps {
        const {port,interface: ifaceName} = props;
        let serial;
    
        if (ifaceName && typeof ifaceName ==='string') {        
            serial = SerialInterface.getInstance({ifaceName})
        }
        else {
            serial = props.interface
        }
    
        if (!serial || !serial.binding)
            throw new Error(`unknonwn interface: ${ifaceName}`)
    
        const path = `${port}` ;
        return {serial, path}
    }
    

    getName() {
        return this.name
    }

    setName(name:string) {
        this.name = name;
    }

    getProtocolName(): string {
        return PROTOCOL_NAME
    }

    async performCheck():Promise<boolean> {

        var info:DaumClassicStartInfo = {} 

        const check =  new Promise(  async (resolve, reject ) => {
            this.logEvent( {message:"checking device",port:this.getPort()});
            

            try {
                await this.stop()                        
              
                const connected = await waitWithTimeout(this.connect(), 5000, ()=>{
                    this.logEvent( {message:"checking device failed", port:this.getPort(), reason:'timeout'});
                })

                if (!connected) {
                    resolve(false)
                    return;
                }
                this.stopped = false;
                               
                const address = await this.getComms().getAddress() 
                info.bikeNo = address?.bike;

                const version = await this.getComms().getVersion() 
                info.serialNo = version?.serialNo;                
                info.cockpit = version?.cockpit                
                this.setName('Daum '+info.cockpit);

                this.pause();
                this.started = false;

                this.logEvent( {message:"checking device success",port:this.getPort(),info});
                resolve(true)               
            }
            catch (err) {
                this.logEvent( {message:"checking device failed", port:this.getPort(), reason:err.message});
                resolve(false)
            }

        })

        return await waitWithTimeout( check, 5000, ()=>{
            this.logEvent( {message:"checking device failed", port:this.getPort(), reason:'Timeout'});
            return false
        })

    }

    performStart(props:DaumClassicProperties={}, isRelaunch=false, wasPaused=false):Promise<boolean> {
        
        this.stopUpdatePull();
        

        this.setBikeProps(props)
        this.getComms().resumeLogging()

        const user: User = this.getUser()
        const {gear=DEFAULT_GEAR} = props


        this.initData();        
        let stopped = false

        let startState = { } as any;  

        const start = async ()=>{

            try {
                if (stopped) {
                    this.started = false;
                    return false
                }
    

                this.logEvent({message: 'start attempt',   isRelaunch, isConnected:this.getComms().isConnected()})

                if (!isRelaunch && !this.getComms().isConnected()) {
                    await this.verifyConnection()
                }
                
                if (!wasPaused && !startState.reset) {
                    await this.getComms().resetDevice();
                    startState.reset = true;
                }

                if ( !wasPaused && !startState.setProg) {
                    await this.getComms().setProg(0);
                    startState.setProg = true;
                }
                if ( !wasPaused && !startState.setPerson) {
                    await this.getComms().setPerson(user);
                    startState.setPerson = true;
                }

                if ( !wasPaused && !startState.setBikeType) {            
                    const bikeType = this.getCyclingMode().getSetting('bikeType') || 'race'                    
                    await this.getComms().setBikeType(bikeType.toLowerCase());                    
                    startState.setBikeType = true;                    
                }

                if ( !wasPaused && !startState.startProg) {              
                    await this.getComms().startProg();
                    startState.startProg = true;
                }
                if ( !startState.setGear) {
                    await this.getComms().setGear( this.deviceData.gear || gear);    
                    startState.setGear = true;
                }

                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendRequest(startRequest);
                
                startState.checkRunData = true;
                const data = await this.getComms().runData();
                
                if (startRequest.targetPower && startRequest.targetPower!==25 && data.power===25) {
                    throw (new Error( 'invalid device response: runData'));
                }

                this.started = true;
                this.startUpdatePull();
                
                return (true);
                
            }
            catch (err) {
                if (stopped)
                    return false;

                this.logEvent({message: 'start attempt failed',  error:err.message})
                this.started = false;
                
                if ( startState.checkRunData ) { 
                    startState = { } as any
                }
                throw( new Error(`could not start device, reason:${err.message}`));
            }
        }

        const  checkInterrupt = ()=>new Promise ( done=> {
            this.internalEmitter.on('stop', ()=>{ 
                stopped = true;
                this.started = false;
                done(false)
            })
        })

        return runWithRetries( ()=>Promise.race([start(),checkInterrupt()]), 5, 1000 )
    }

    async getCurrentBikeData():Promise<IncyclistBikeData> {
        if (this.stopped)
            return;

        await this.verifyConnection()        
        return this.getComms().runData()
    }

    async getDeviceInfo():Promise<any> {
        if (this.stopped)
            return;

        const version = await this.getComms().getVersion();
        return version || {}
    }

}